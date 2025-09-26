using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Windows.Forms;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using RevitFamilyToGLB.Export;
using RevitFamilyToGLB.UI;
using RevitFamilyToGLB.Models;

namespace RevitFamilyToGLB.Commands
{
    [Transaction(TransactionMode.Manual)]
    [Regeneration(RegenerationOption.Manual)]
    public class FamilyToGLBCommand : IExternalCommand
    {
        public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
        {
            try
            {
                UIApplication uiApp = commandData.Application;
                UIDocument uiDoc = uiApp.ActiveUIDocument;
                Document doc = uiDoc.Document;

                // 1. Confirm this is a Family Document
                if (!doc.IsFamilyDocument)
                {
                    TaskDialog.Show("Error", 
                        "This command must be run from the Family Editor.\n" +
                        "Please open a .rfa file in the Family Editor and try again.");
                    return Result.Failed;
                }

                FamilyManager familyManager = doc.FamilyManager;
                
                // Check if there are any family types
                if (familyManager.Types.Size == 0)
                {
                    TaskDialog.Show("Error", 
                        "No family types found.\n" +
                        "Please create at least one family type before exporting.");
                    return Result.Failed;
                }

                // 2. Show configuration dialog
                ExportOptions options = null;
                using (var dialog = new ExportOptionsDialog(doc))
                {
                    if (dialog.ShowDialog() != DialogResult.OK)
                    {
                        return Result.Cancelled;
                    }
                    options = dialog.GetOptions();
                }

                // 3. Collect parameter schema
                var parameterSchema = CollectParameterSchema(familyManager);

                // 4. Build list of Family Types to export
                var typesToExport = new List<FamilyType>();
                if (options.ExportCurrentTypeOnly)
                {
                    typesToExport.Add(familyManager.CurrentType);
                }
                else
                {
                    foreach (FamilyType type in familyManager.Types)
                    {
                        typesToExport.Add(type);
                    }
                }

                // 5. Export each type
                var exportedTypes = new List<ExportedFamilyType>();
                var geometryExtractor = new GeometryExtractor(doc, options.DetailLevel);
                var relationshipExtractor = new ParameterRelationshipExtractor(doc, familyManager);
                
                foreach (var familyType in typesToExport)
                {
                    using (Transaction trans = new Transaction(doc, "Export Family Type"))
                    {
                        trans.Start();
                        
                        // Set current type
                        familyManager.CurrentType = familyType;
                        
                        // Regenerate
                        doc.Regenerate();
                        
                        // Gather parameter values
                        var parameterValues = CollectParameterValues(familyManager, parameterSchema);
                        
                        // Extract geometry
                        var geometryData = geometryExtractor.ExtractGeometry();
                        
                        // Create exported type data
                        var exportedType = new ExportedFamilyType
                        {
                            Name = familyType.Name,
                            ParameterValues = parameterValues,
                            Geometry = geometryData
                        };
                        
                        exportedTypes.Add(exportedType);
                        
                        // Rollback transaction (no changes to family)
                        trans.RollBack();
                    }

                // 6. Create GLB file
                var glbExporter = new GLBExporter();
                var outputPath = Path.Combine(options.OutputFolder, 
                    $"{Path.GetFileNameWithoutExtension(doc.Title)}.glb");

                var exportResult = glbExporter.Export(
                    exportedTypes,
                    parameterSchema,
                    relationshipExtractor.ExtractRelationships(parameterSchema),
                    outputPath);

                // 7. Export parameters to CSV
                var csvExporter = new ParameterCSVExporter();
                csvExporter.ExportParametersToCSV(parameterSchema, exportedTypes, outputPath);
{{ ... }}

                // 8. Show summary
                ShowExportSummary(exportResult, outputPath, parameterSchema.Count);

                return Result.Succeeded;
            }
            catch (Exception ex)
            {
                message = ex.Message;
                TaskDialog.Show("Error", $"Export failed:\n{ex.Message}");
                return Result.Failed;
            }
        }

        private List<ParameterInfo> CollectParameterSchema(FamilyManager familyManager)
        {
            var schema = new List<ParameterInfo>();
            
            foreach (FamilyParameter param in familyManager.Parameters)
            {
                var info = new ParameterInfo
                {
                    Name = param.Definition.Name,
                    IsInstance = param.IsInstance,
                    IsReporting = param.IsReporting,
                    IsShared = param.IsShared,
                    StorageType = param.StorageType.ToString(),
                    Formula = param.Formula
                };

                // Get GUID if shared
                if (param.IsShared && param.Definition is ExternalDefinition extDef)
                {
                    info.Guid = extDef.GUID.ToString();
                }

                // Get data type (ForgeTypeId for Revit 2022+)
                // For Revit 2022+, using GetDataType()
                if (param.Definition is InternalDefinition intDef)
                {
                    try
                    {
                        var forgeTypeId = intDef.GetDataType();
                        info.DataType = forgeTypeId?.TypeId ?? "Unknown";
                    }
                    catch
                    {
                        info.DataType = param.StorageType.ToString();
                    }
                }
                else
                {
                    info.DataType = param.StorageType.ToString();
                }

                schema.Add(info);
            }
            
            return schema;
        }

        private Dictionary<string, object> CollectParameterValues(
            FamilyManager familyManager, 
            List<ParameterInfo> schema)
        {
            var values = new Dictionary<string, object>();
            
            foreach (var paramInfo in schema)
            {
                var param = familyManager.get_Parameter(paramInfo.Name);
                if (param == null) continue;

                object value = null;
                
                switch (param.StorageType)
                {
                    case StorageType.Double:
                        var doubleVal = familyManager.CurrentType.AsDouble(param);
                        if (doubleVal.HasValue)
                        {
                            double doubleValue = doubleVal.Value;
                            // Convert feet to meters for length parameters
                            if (IsLengthParameter(paramInfo))
                            {
                                // Revit internal units are feet, convert to meters
                                value = doubleValue * 0.3048;
                            }
                            else
                            {
                                value = doubleValue; // Keep as radians for angles, etc.
                            }
                        }
                        else
                        {
                            value = 0.0; // Default value for null doubles
                        }
                        break;
                        
                    case StorageType.Integer:
                        var intVal = familyManager.CurrentType.AsInteger(param);
                        value = intVal.HasValue ? intVal.Value : 0;
                        break;
                        
                    case StorageType.String:
                        value = familyManager.CurrentType.AsString(param);
                        break;
                        
                    case StorageType.ElementId:
                        var id = familyManager.CurrentType.AsElementId(param);
                        value = id?.Value ?? -1;
                        break;
                }
                
                if (value != null)
                {
                    values[paramInfo.Name] = value;
                }
            }
            
            return values;
        }

        private bool IsLengthParameter(ParameterInfo paramInfo)
        {
            // Check if parameter is a length type
            return paramInfo.DataType != null && 
                   (paramInfo.DataType.Contains("Length") || 
                    paramInfo.DataType.Contains("length") ||
                    paramInfo.DataType.Contains("Double"));
        }

        private void ShowExportSummary(ExportResult result, string outputPath, int parameterCount)
        {
            var csvPath = Path.ChangeExtension(outputPath, ".csv");
            var summaryPath = Path.ChangeExtension(outputPath, "_parameter_summary.csv");
            var folder = Path.GetDirectoryName(outputPath);
            
            var summary = $"Export Successful!\n\n" +
                         $"📁 Output Folder: {folder}\n\n" +
                         $"📦 GLB File: {Path.GetFileName(outputPath)}\n" +
                         $"   Family Types: {result.TypeCount}\n" +
                         $"   Vertices: {result.VertexCount:N0}\n" +
                         $"   Triangles: {result.TriangleCount:N0}\n" +
                         $"   File Size: {result.FileSizeKB:F2} KB\n\n" +
                         $"📊 Parameter Data:\n" +
                         $"   CSV File: {Path.GetFileName(csvPath)}\n" +
                         $"   Summary: {Path.GetFileName(summaryPath)}\n" +
                         $"   Total Parameters: {parameterCount}\n\n" +
                         $"✅ All files exported successfully!";
            
            TaskDialog.Show("Export Complete", summary);
        }
    }
}
