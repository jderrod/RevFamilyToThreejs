# Deployment Guide - Revit Family to Three.js Converter

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Building the Revit Add-in](#building-the-revit-add-in)
3. [Installing the Add-in](#installing-the-add-in)
4. [Using the Add-in](#using-the-add-in)
5. [Setting up the Web Viewer](#setting-up-the-web-viewer)
6. [Optional: Server Mode](#optional-server-mode)
7. [Troubleshooting](#troubleshooting)

## Prerequisites

### For the Revit Add-in
- **Revit 2022 or newer** (2023, 2024, or 2025 recommended)
- **Visual Studio 2022** with .NET desktop development workload
- **.NET Framework 4.8**
- **Windows 10/11** (64-bit)

### For the Web Viewer
- Modern web browser (Chrome, Firefox, Edge, Safari)
- Python 3.x or Node.js (for local development server)

## Building the Revit Add-in

### Method 1: Using the Build Script

1. Navigate to the `RevitAddin` folder:
   ```cmd
   cd C:\Users\james.derrod\CascadeProjects\RevFamilyToThreejs\RevitAddin
   ```

2. Update the build script (`build.bat`) with your Revit version and MSBuild path:
   - Edit line 8: Set your Revit version (2023, 2024, or 2025)
   - Edit line 6: Verify MSBuild path

3. Run the build script:
   ```cmd
   build.bat
   ```

### Method 2: Using Visual Studio

1. Open `RevitFamilyToGLB.csproj` in Visual Studio 2022

2. Update the Revit API references:
   - Right-click on References → Add Reference
   - Browse to your Revit installation folder (e.g., `C:\Program Files\Autodesk\Revit 2025`)
   - Add `RevitAPI.dll` and `RevitAPIUI.dll`
   - Set "Copy Local" to False for both references

3. Select the appropriate configuration (Debug 2025, Debug 2024, etc.)

4. Build the solution (Ctrl+Shift+B)

### Method 3: Using MSBuild Command Line

```cmd
cd RevitAddin
msbuild RevitFamilyToGLB.csproj /p:Configuration=Debug /p:Platform=x64 /t:Restore,Build
```

## Installing the Add-in

### Automatic Installation (via build script)
The build script automatically copies the `.addin` manifest to the correct location.

### Manual Installation

1. Copy the `.addin` manifest file:
   - From: `RevitAddin\bin\Debug\RevitFamilyToGLB.addin`
   - To: `%APPDATA%\Autodesk\Revit\Addins\[Version]\`
   - Example: `C:\Users\[YourUsername]\AppData\Roaming\Autodesk\Revit\Addins\2025\`

2. Ensure the DLL path in the `.addin` file points to your compiled DLL:
   ```xml
   <Assembly>C:\Users\james.derrod\CascadeProjects\RevFamilyToThreejs\RevitAddin\bin\Debug\RevitFamilyToGLB.dll</Assembly>
   ```

3. Start Revit and check the Add-Ins tab

## Using the Add-in

### Exporting a Family

1. **Open a Family Document**
   - Launch Revit
   - Open a `.rfa` file in the Family Editor
   - The sample door family is located at: `C:\Users\james.derrod\CascadeProjects\RevFamilyToThreejs\3X8X_door_v8_2025_09_05.rfa`

2. **Run the Export Command**
   - Go to Add-Ins tab → External Tools → Export Family to GLB
   - Or use the keyboard shortcut if configured

3. **Configure Export Options**
   - **Output Folder**: Choose where to save the GLB file
   - **Detail Level**: Select Coarse, Medium, or Fine (Fine recommended for best quality)
   - **Export Scope**: 
     - Current Family Type Only (faster, single node)
     - All Family Types (complete export, multiple nodes)
   - **Enable Compression**: Reduces file size

4. **Export**
   - Click Export
   - Wait for the process to complete
   - Review the summary dialog showing statistics

### Understanding the Output

The exported GLB file contains:
- **Geometry**: Triangulated 3D mesh in meters (Y-up coordinate system)
- **Metadata** in `asset.extras.rvt`:
  ```json
  {
    "rvt": {
      "parameters": [...],  // Parameter schema
      "types": [...],       // Type names and values
      "units": {            // Unit conventions
        "length": "meters",
        "angle": "radians"
      }
    }
  }
  ```

## Setting up the Web Viewer

### Quick Start

1. Navigate to the Viewer folder:
   ```cmd
   cd C:\Users\james.derrod\CascadeProjects\RevFamilyToThreejs\Viewer
   ```

2. Start a local web server:

   **Using Python:**
   ```cmd
   python -m http.server 8000
   ```

   **Using Node.js:**
   ```cmd
   npm install -g live-server
   live-server
   ```

3. Open your browser and navigate to:
   - Basic viewer: `http://localhost:8000/index.html`
   - Server-enabled viewer: `http://localhost:8000/index-with-server.html`

### Using the Viewer

1. Click "Load GLB File" and select your exported GLB
2. Use mouse to orbit, zoom, and pan the model
3. View and interact with parameters in the sidebar
4. Switch between family types if multiple were exported

## Optional: Server Mode

### Enabling the Local HTTP Server

The server mode allows real-time parameter updates from the web viewer to Revit.

1. **Add Server Start Command to Revit Add-in**
   
   Create a new External Command in your add-in that starts the server:
   ```csharp
   var server = new LocalHttpServer(commandData.Application, 8080);
   server.Start();
   ```

2. **Start the Server in Revit**
   - Open your family in Revit
   - Run the server start command from Add-Ins menu
   - Note the port number (default: 8080)

3. **Use the Server-Enabled Viewer**
   - Open `index-with-server.html` in your browser
   - The viewer will automatically detect the server
   - Enable "Live Update Mode" in the parameters panel
   - Changes to parameters will update the model in real-time

### Security Considerations

- The local server only accepts connections from localhost
- Default port: 8080 (configurable)
- No authentication (designed for local use only)
- Disable when not in use

## Troubleshooting

### Common Issues and Solutions

#### Add-in doesn't appear in Revit

1. Check the `.addin` file location:
   ```
   %APPDATA%\Autodesk\Revit\Addins\[Version]\
   ```

2. Verify the DLL path in the `.addin` file is correct

3. Check Revit's journal file for loading errors:
   ```
   %LOCALAPPDATA%\Autodesk\Revit\[Version]\Journals\
   ```

#### Export fails with "Not a Family Document" error

- Ensure you have a `.rfa` file open in the Family Editor
- The command only works with family documents, not projects

#### GLB file is very large

- Use "Fine" detail level only when necessary
- Enable compression in export options
- Consider exporting current type only during development

#### Viewer shows "No parameters found"

- Check if the GLB contains metadata: Open in a text editor and search for "rvt"
- Ensure parameters exist in the Revit family
- Verify the export completed successfully

#### Server connection fails

1. Check Windows Firewall settings
2. Verify port 8080 is not in use:
   ```cmd
   netstat -an | findstr :8080
   ```
3. Try a different port if needed

### Performance Optimization

#### For Large Families

1. **Export Settings**:
   - Use Coarse or Medium detail for preview
   - Export current type only during iteration
   - Enable compression

2. **Viewer Settings**:
   - Reduce shadow quality for better performance
   - Disable real-time updates for complex models

#### For Multiple Types

1. Consider exporting types individually
2. Use type switching in viewer rather than showing all simultaneously

## Support and Resources

### File Locations

- **Add-in Source**: `C:\Users\james.derrod\CascadeProjects\RevFamilyToThreejs\RevitAddin\`
- **Web Viewer**: `C:\Users\james.derrod\CascadeProjects\RevFamilyToThreejs\Viewer\`
- **Sample Family**: `C:\Users\james.derrod\CascadeProjects\RevFamilyToThreejs\3X8X_door_v8_2025_09_05.rfa`

### API Documentation

- [Revit API Documentation](https://www.revitapidocs.com/)
- [Three.js Documentation](https://threejs.org/docs/)
- [glTF 2.0 Specification](https://github.com/KhronosGroup/glTF/tree/master/specification/2.0)

### Known Limitations

1. Complex formulas may not evaluate correctly in the viewer
2. Material properties are simplified (single default material)
3. Nested families may require special handling
4. Some parameter types (e.g., ElementId references) are read-only

## Next Steps

1. Test with your specific Revit families
2. Customize the viewer UI for your needs
3. Add material and texture support
4. Implement formula evaluation in JavaScript
5. Add support for parameter constraints
6. Create a cloud-based deployment option

## Version History

- **1.0.0** - Initial release with basic export and viewing capabilities
- Supports Revit 2022-2025
- GLB export with parametric metadata
- Three.js viewer with parameter display
- Optional local HTTP server for real-time updates
