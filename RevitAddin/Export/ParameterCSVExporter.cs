using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using RevitFamilyToGLB.Models;

namespace RevitFamilyToGLB.Export
{
    public class ParameterCSVExporter
    {
        public void ExportParametersToCSV(
            List<ParameterInfo> parameterSchema, 
            List<ExportedFamilyType> exportedTypes, 
            string outputPath)
        {
            var csvPath = Path.ChangeExtension(outputPath, ".csv");
            
            using (var writer = new StreamWriter(csvPath, false, Encoding.UTF8))
            {
                // Write header
                WriteCSVHeader(writer, exportedTypes);
                
                // Write parameter data
                WriteParameterRows(writer, parameterSchema, exportedTypes);
            }
        }

        private void WriteCSVHeader(StreamWriter writer, List<ExportedFamilyType> exportedTypes)
        {
            var header = new List<string>
            {
                "Parameter Name",
                "Is Instance",
                "Is Reporting", 
                "Is Shared",
                "Storage Type",
                "Data Type",
                "Formula",
                "GUID"
            };

            // Add columns for each family type's values
            foreach (var type in exportedTypes)
            {
                header.Add($"Value ({type.Name})");
                header.Add($"Units ({type.Name})");
            }

            writer.WriteLine(string.Join(",", header.Select(EscapeCSVField)));
        }

        private void WriteParameterRows(
            StreamWriter writer, 
            List<ParameterInfo> parameterSchema, 
            List<ExportedFamilyType> exportedTypes)
        {
            foreach (var param in parameterSchema)
            {
                var row = new List<string>
                {
                    param.Name,
                    param.IsInstance.ToString(),
                    param.IsReporting.ToString(),
                    param.IsShared.ToString(),
                    param.StorageType,
                    param.DataType ?? "",
                    param.Formula ?? "",
                    param.Guid ?? ""
                };

                // Add parameter values for each family type
                foreach (var type in exportedTypes)
                {
                    if (type.ParameterValues.ContainsKey(param.Name))
                    {
                        var value = type.ParameterValues[param.Name];
                        var (displayValue, units) = FormatParameterValue(param, value);
                        row.Add(displayValue);
                        row.Add(units);
                    }
                    else
                    {
                        row.Add(""); // No value
                        row.Add(""); // No units
                    }
                }

                writer.WriteLine(string.Join(",", row.Select(EscapeCSVField)));
            }
        }

        private (string displayValue, string units) FormatParameterValue(ParameterInfo param, object value)
        {
            if (value == null)
                return ("", "");

            string displayValue = "";
            string units = "";

            switch (param.StorageType)
            {
                case "Double":
                    if (value is double doubleVal)
                    {
                        if (IsLengthParameter(param))
                        {
                            // Value is already in meters (converted in main code)
                            displayValue = doubleVal.ToString("F6");
                            units = "m";
                            
                            // Also show feet for reference
                            var feet = doubleVal / 0.3048;
                            displayValue += $" ({feet:F4} ft)";
                        }
                        else if (IsAreaParameter(param))
                        {
                            displayValue = doubleVal.ToString("F6");
                            units = "m²";
                            
                            var sqft = doubleVal / 0.092903; // m² to ft²
                            displayValue += $" ({sqft:F4} ft²)";
                        }
                        else if (IsVolumeParameter(param))
                        {
                            displayValue = doubleVal.ToString("F6");
                            units = "m³";
                            
                            var cuft = doubleVal / 0.0283168; // m³ to ft³
                            displayValue += $" ({cuft:F4} ft³)";
                        }
                        else if (IsAngleParameter(param))
                        {
                            displayValue = doubleVal.ToString("F6");
                            units = "rad";
                            
                            var degrees = doubleVal * 180.0 / Math.PI;
                            displayValue += $" ({degrees:F2}°)";
                        }
                        else
                        {
                            displayValue = doubleVal.ToString("F6");
                            units = GetGenericUnits(param);
                        }
                    }
                    break;

                case "Integer":
                    if (IsBooleanParameter(param))
                    {
                        displayValue = (Convert.ToInt32(value) == 1) ? "True" : "False";
                        units = "Boolean";
                    }
                    else
                    {
                        displayValue = value.ToString();
                        units = "Integer";
                    }
                    break;

                case "String":
                    displayValue = value.ToString() ?? "";
                    units = "Text";
                    break;

                case "ElementId":
                    displayValue = value.ToString();
                    units = "Element ID";
                    break;

                default:
                    displayValue = value.ToString() ?? "";
                    units = param.StorageType;
                    break;
            }

            return (displayValue, units);
        }

        private bool IsLengthParameter(ParameterInfo param)
        {
            return param.DataType != null && 
                   (param.DataType.Contains("Length") || 
                    param.DataType.Contains("length") ||
                    param.Name.ToLower().Contains("length") ||
                    param.Name.ToLower().Contains("width") ||
                    param.Name.ToLower().Contains("height") ||
                    param.Name.ToLower().Contains("depth") ||
                    param.Name.ToLower().Contains("thickness"));
        }

        private bool IsAreaParameter(ParameterInfo param)
        {
            return param.DataType != null && 
                   (param.DataType.Contains("Area") || 
                    param.DataType.Contains("area") ||
                    param.Name.ToLower().Contains("area"));
        }

        private bool IsVolumeParameter(ParameterInfo param)
        {
            return param.DataType != null && 
                   (param.DataType.Contains("Volume") || 
                    param.DataType.Contains("volume") ||
                    param.Name.ToLower().Contains("volume"));
        }

        private bool IsAngleParameter(ParameterInfo param)
        {
            return param.DataType != null && 
                   (param.DataType.Contains("Angle") || 
                    param.DataType.Contains("angle") ||
                    param.Name.ToLower().Contains("angle") ||
                    param.Name.ToLower().Contains("rotation"));
        }

        private bool IsBooleanParameter(ParameterInfo param)
        {
            return param.DataType != null && 
                   (param.DataType.Contains("bool") || 
                    param.DataType.Contains("Boolean") ||
                    param.DataType.Contains("YesNo"));
        }

        private string GetGenericUnits(ParameterInfo param)
        {
            if (param.DataType != null)
            {
                if (param.DataType.Contains("Force")) return "N";
                if (param.DataType.Contains("Pressure")) return "Pa";
                if (param.DataType.Contains("Currency")) return "$";
                if (param.DataType.Contains("Number")) return "";
            }
            return "";
        }

        private string EscapeCSVField(string field)
        {
            if (string.IsNullOrEmpty(field))
                return "";

            // If field contains comma, newline, or quote, wrap in quotes and escape quotes
            if (field.Contains(",") || field.Contains("\n") || field.Contains("\""))
            {
                return "\"" + field.Replace("\"", "\"\"") + "\"";
            }
            
            return field;
        }

        public void ExportParameterSummary(
            List<ParameterInfo> parameterSchema,
            List<ExportedFamilyType> exportedTypes,
            string outputPath)
        {
            var summaryPath = Path.ChangeExtension(outputPath, "_parameter_summary.csv");
            
            using (var writer = new StreamWriter(summaryPath, false, Encoding.UTF8))
            {
                // Write summary header
                writer.WriteLine("Parameter Analysis Summary");
                writer.WriteLine($"Generated: {DateTime.Now:yyyy-MM-dd HH:mm:ss}");
                writer.WriteLine($"Family Types: {exportedTypes.Count}");
                writer.WriteLine($"Total Parameters: {parameterSchema.Count}");
                writer.WriteLine();

                // Parameter type breakdown
                writer.WriteLine("Parameter Type Breakdown:");
                writer.WriteLine("Category,Count");
                
                var instanceParams = parameterSchema.Count(p => p.IsInstance);
                var typeParams = parameterSchema.Count(p => !p.IsInstance);
                var reportingParams = parameterSchema.Count(p => p.IsReporting);
                var sharedParams = parameterSchema.Count(p => p.IsShared);
                var formulaParams = parameterSchema.Count(p => !string.IsNullOrEmpty(p.Formula));

                writer.WriteLine($"Instance Parameters,{instanceParams}");
                writer.WriteLine($"Type Parameters,{typeParams}");
                writer.WriteLine($"Reporting Parameters,{reportingParams}");
                writer.WriteLine($"Shared Parameters,{sharedParams}");
                writer.WriteLine($"Parameters with Formulas,{formulaParams}");
                
                // Storage type breakdown
                writer.WriteLine();
                writer.WriteLine("Storage Type Breakdown:");
                var storageGroups = parameterSchema.GroupBy(p => p.StorageType);
                foreach (var group in storageGroups)
                {
                    writer.WriteLine($"{group.Key},{group.Count()}");
                }

                // Editable parameters (no formulas, not reporting)
                writer.WriteLine();
                writer.WriteLine("Editable Parameters (no formulas, not reporting):");
                writer.WriteLine("Parameter Name,Storage Type,Data Type");
                
                var editableParams = parameterSchema.Where(p => 
                    !p.IsReporting && 
                    string.IsNullOrEmpty(p.Formula)).ToList();
                
                foreach (var param in editableParams)
                {
                    writer.WriteLine($"{EscapeCSVField(param.Name)},{param.StorageType},{EscapeCSVField(param.DataType ?? "")}");
                }
            }
        }
    }
}
