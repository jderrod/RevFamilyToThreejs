using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using Autodesk.Revit.DB;
using RevitFamilyToGLB.Models;

namespace RevitFamilyToGLB.Export
{
    public class ParameterRelationshipExtractor
    {
        private readonly Document _document;
        private readonly FamilyManager _familyManager;

        public ParameterRelationshipExtractor(Document document, FamilyManager familyManager)
        {
            _document = document ?? throw new ArgumentNullException(nameof(document));
            _familyManager = familyManager ?? throw new ArgumentNullException(nameof(familyManager));
        }

        public List<ParameterRelationship> ExtractRelationships(List<ParameterInfo> parameterSchema)
        {
            if (parameterSchema == null)
            {
                throw new ArgumentNullException(nameof(parameterSchema));
            }

            var relationships = InitializeRelationships(parameterSchema);
            var familyParameterLookup = BuildFamilyParameterLookup();

            PopulateFormulaDependencies(relationships);
            CaptureDimensionTargets(relationships, familyParameterLookup);
            CaptureElementParameterTargets(relationships);

            return relationships.Values.ToList();
        }

        private Dictionary<string, ParameterRelationship> InitializeRelationships(List<ParameterInfo> parameterSchema)
        {
            var comparer = StringComparer.OrdinalIgnoreCase;
            var relationships = new Dictionary<string, ParameterRelationship>(comparer);

            foreach (var parameter in parameterSchema)
            {
                if (string.IsNullOrWhiteSpace(parameter?.Name))
                {
                    continue;
                }

                if (!relationships.ContainsKey(parameter.Name))
                {
                    relationships[parameter.Name] = new ParameterRelationship
                    {
                        ParameterName = parameter.Name,
                        Formula = parameter.Formula,
                        IsReporting = parameter.IsReporting
                    };
                }
            }

            return relationships;
        }

        private Dictionary<ElementId, FamilyParameter> BuildFamilyParameterLookup()
        {
            var lookup = new Dictionary<ElementId, FamilyParameter>();
            foreach (FamilyParameter familyParameter in _familyManager.Parameters)
            {
                if (!lookup.ContainsKey(familyParameter.Id))
                {
                    lookup[familyParameter.Id] = familyParameter;
                }
            }
            return lookup;
        }

        private void PopulateFormulaDependencies(Dictionary<string, ParameterRelationship> relationships)
        {
            var parameterNames = new HashSet<string>(relationships.Keys, StringComparer.OrdinalIgnoreCase);
            foreach (var relationship in relationships.Values)
            {
                if (string.IsNullOrWhiteSpace(relationship.Formula))
                {
                    continue;
                }

                var referencedNames = ExtractDependenciesFromFormula(relationship.Formula);
                foreach (var token in referencedNames)
                {
                    if (parameterNames.Contains(token) && !relationship.Dependencies.Contains(token, StringComparer.OrdinalIgnoreCase))
                    {
                        relationship.Dependencies.Add(token);
                    }
                }
            }
        }

        private static IEnumerable<string> ExtractDependenciesFromFormula(string formula)
        {
            if (string.IsNullOrWhiteSpace(formula))
            {
                return Enumerable.Empty<string>();
            }

            var identifiers = Regex.Matches(formula, @"[A-Za-z_][A-Za-z0-9_]*")
                .Cast<Match>()
                .Select(match => match.Value)
                .Where(value => !IsReservedKeyword(value))
                .Distinct(StringComparer.OrdinalIgnoreCase);

            return identifiers;
        }

        private static bool IsReservedKeyword(string token)
        {
            if (string.IsNullOrWhiteSpace(token))
            {
                return true;
            }

            var keywords = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "and", "or", "not", "if", "then", "else", "true", "false", "pi"
            };

            return keywords.Contains(token);
        }

        private void CaptureDimensionTargets(Dictionary<string, ParameterRelationship> relationships, Dictionary<ElementId, FamilyParameter> familyParameterLookup)
        {
            var dimensions = new FilteredElementCollector(_document)
                .OfClass(typeof(Dimension))
                .Cast<Dimension>();

            foreach (var dimension in dimensions)
            {
                var label = dimension.FamilyLabel;
                if (label == null)
                {
                    continue;
                }

                if (!familyParameterLookup.TryGetValue(label.Id, out var familyParameter))
                {
                    continue;
                }

                var parameterName = familyParameter.Definition?.Name;
                if (string.IsNullOrWhiteSpace(parameterName))
                {
                    continue;
                }

                if (!relationships.TryGetValue(parameterName, out var relationship))
                {
                    continue;
                }

                var target = new RelationshipTarget
                {
                    ElementId = dimension.Id.IntegerValue.ToString(),
                    Category = dimension.Category?.Name,
                    GeometryType = "Dimension",
                    ReferenceStableRepresentation = BuildReferenceStableRepresentation(dimension.References)
                };

                relationship.Targets.Add(target);
            }
        }

        private string BuildReferenceStableRepresentation(ReferenceArray referenceArray)
        {
            if (referenceArray == null || referenceArray.Size == 0)
            {
                return null;
            }

            var representations = new List<string>();
            foreach (Reference reference in referenceArray)
            {
                if (reference == null)
                {
                    continue;
                }

                try
                {
                    var stable = reference.ConvertToStableRepresentation(_document);
                    if (!string.IsNullOrWhiteSpace(stable))
                    {
                        representations.Add(stable);
                    }
                }
                catch
                {
                    // Ignore references that cannot be converted
                }
            }

            return representations.Count > 0 ? string.Join(";", representations) : null;
        }

        private void CaptureElementParameterTargets(Dictionary<string, ParameterRelationship> relationships)
        {
            var comparer = StringComparer.OrdinalIgnoreCase;
            var parameterNames = new HashSet<string>(relationships.Keys, comparer);

            var allElements = new FilteredElementCollector(_document)
                .WhereElementIsNotElementType()
                .ToElements();

            foreach (var element in allElements)
            {
                if (element == null)
                {
                    continue;
                }

                foreach (Parameter parameter in element.Parameters)
                {
                    if (parameter?.Definition == null)
                    {
                        continue;
                    }

                    var parameterName = parameter.Definition.Name;
                    if (!parameterNames.Contains(parameterName))
                    {
                        continue;
                    }

                    if (!relationships.TryGetValue(parameterName, out var relationship))
                    {
                        continue;
                    }

                    // Avoid adding duplicate targets for the same element
                    var alreadyExists = relationship.Targets.Any(target =>
                        string.Equals(target.ElementId, element.Id.IntegerValue.ToString(), StringComparison.Ordinal) &&
                        string.Equals(target.GeometryType, "ElementParameter", StringComparison.OrdinalIgnoreCase));

                    if (alreadyExists)
                    {
                        continue;
                    }

                    var target = new RelationshipTarget
                    {
                        ElementId = element.Id.IntegerValue.ToString(),
                        Category = element.Category?.Name,
                        GeometryType = "ElementParameter"
                    };

                    relationship.Targets.Add(target);
                }
            }
        }
    }
}
