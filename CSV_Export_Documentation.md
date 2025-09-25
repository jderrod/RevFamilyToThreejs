# Parameter CSV Export Feature

## Overview
The Revit Family to GLB exporter now automatically exports all family parameters to CSV files alongside the GLB geometry file. This provides comprehensive parameter data for analysis, documentation, and integration with other tools.

## Generated Files
When you export a family (e.g., `MyFamily.rfa`), the plugin will generate:

1. **`MyFamily.glb`** - 3D geometry with embedded metadata
2. **`MyFamily.csv`** - Detailed parameter data for all family types
3. **`MyFamily_parameter_summary.csv`** - Parameter analysis summary

## CSV File Contents

### Main Parameter CSV (`MyFamily.csv`)
Contains detailed parameter information with columns for:

- **Parameter Name** - Name of the parameter
- **Is Instance** - Whether parameter is instance-level (True) or type-level (False)
- **Is Reporting** - Whether parameter is reporting (read-only, computed from geometry)
- **Is Shared** - Whether parameter uses shared parameters
- **Storage Type** - Revit storage type (Double, Integer, String, ElementId)
- **Data Type** - Revit data type (Length, Area, Volume, etc.)
- **Formula** - Formula expression if parameter is formula-driven
- **GUID** - Shared parameter GUID if applicable
- **Value (TypeName)** - Parameter value for each family type
- **Units (TypeName)** - Units and additional unit conversions

### Parameter Values with Units
The CSV includes intelligent unit handling:

- **Length Parameters**: Displayed in meters with feet conversion
  - Example: `2.4384 (8.0000 ft)`
- **Area Parameters**: Square meters with square feet conversion
  - Example: `5.5742 (60.0000 ft²)`
- **Volume Parameters**: Cubic meters with cubic feet conversion
- **Angle Parameters**: Radians with degrees conversion
  - Example: `1.5708 (90.00°)`
- **Boolean Parameters**: True/False values
- **Text Parameters**: String values
- **Element ID Parameters**: Revit element IDs

### Summary CSV (`MyFamily_parameter_summary.csv`)
Contains analysis of the parameter structure:

- **Parameter Type Breakdown**: Instance vs Type parameters
- **Reporting Parameters**: Count of read-only parameters
- **Shared Parameters**: Count of shared parameters
- **Formula Parameters**: Count of formula-driven parameters
- **Storage Type Breakdown**: Distribution of parameter types
- **Editable Parameters**: List of parameters that can be modified (no formulas, not reporting)

## Use Cases

### 1. Parameter Documentation
- Generate comprehensive parameter documentation for families
- Track parameter changes across family versions
- Document formulas and dependencies

### 2. Quality Control
- Identify unused or problematic parameters
- Verify parameter types and units
- Check formula syntax and dependencies

### 3. Family Analysis
- Compare parameters across similar families
- Identify opportunities for standardization
- Analyze parameter usage patterns

### 4. Integration with Other Tools
- Import parameter data into Excel for analysis
- Use data for BIM management workflows
- Generate parameter reports for project documentation

### 5. Parameter Migration
- Prepare data for family standardization projects
- Map parameters when updating family templates
- Archive parameter definitions for future reference

## Example CSV Output

```csv
Parameter Name,Is Instance,Is Reporting,Is Shared,Storage Type,Data Type,Formula,GUID,Value (Standard),Units (Standard),Value (Custom),Units (Custom)
Width,False,False,False,Double,Length,,, 2.4384 (8.0000 ft),m, 3.0480 (10.0000 ft),m
Height,False,False,False,Double,Length,,, 2.1336 (7.0000 ft),m, 2.4384 (8.0000 ft),m
Area,False,True,False,Double,Area,Width * Height,, 5.2026 (56.0000 ft²),m², 7.4322 (80.0000 ft²),m²
Is Visible,True,False,False,Integer,YesNo,,,True,Boolean,False,Boolean
Description,False,False,False,String,Text,,,Standard Door,Text,Custom Door,Text
```

## Technical Implementation

The CSV export is handled by the `ParameterCSVExporter` class which:

1. **Extracts Parameter Schema**: Reads all parameter definitions with metadata
2. **Collects Parameter Values**: Gathers values for each family type
3. **Handles Unit Conversions**: Converts Revit internal units to standard units
4. **Formats Output**: Creates properly escaped CSV with comprehensive data
5. **Generates Summary**: Provides analysis of parameter structure

## Integration

The CSV export is automatically triggered during GLB export and requires no additional configuration. The feature integrates seamlessly with the existing export workflow and maintains all current functionality while adding comprehensive parameter documentation.
