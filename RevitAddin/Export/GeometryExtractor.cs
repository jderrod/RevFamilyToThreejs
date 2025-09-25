using System;
using System.Collections.Generic;
using System.Linq;
using System.Numerics;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using RevitFamilyToGLB.Models;

namespace RevitFamilyToGLB.Export
{
    public class GeometryExtractor
    {
        private readonly Document _document;
        private readonly ViewDetailLevel _detailLevel;
        private const double FEET_TO_METERS = 0.3048;

        public GeometryExtractor(Document document, ViewDetailLevel detailLevel)
        {
            _document = document;
            _detailLevel = detailLevel;
        }

        public GeometryData ExtractGeometry()
        {
            var geometryData = new GeometryData();
            var options = new Options
            {
                DetailLevel = _detailLevel,
                ComputeReferences = true,
                IncludeNonVisibleObjects = true  // Changed to true to get all geometry
            };

            // Check if this is a family document
            if (_document.IsFamilyDocument)
            {
                // Debug: Count elements found
                int elementCount = 0;
                int geometryCount = 0;
                
                // Method 1: Get all solid-creating elements
                var allElements = new FilteredElementCollector(_document)
                    .WhereElementIsNotElementType()
                    .ToElements();

                // Debug message
                System.Diagnostics.Debug.WriteLine($"Total elements found: {allElements.Count}");
                
                foreach (Element element in allElements)
                {
                    elementCount++;
                    
                    // Debug: Log element details
                    System.Diagnostics.Debug.WriteLine($"Element: {element.Name} - Type: {element.GetType().Name} - Category: {element.Category?.Name}");
                    
                    // Try to get geometry from any element
                    var geomElem = element.get_Geometry(options);
                    if (geomElem != null)
                    {
                        geometryCount++;
                        foreach (GeometryObject geomObj in geomElem)
                        {
                            ProcessGeometryObject(geomObj, geometryData, Transform.Identity);
                        }
                    }
                }
                
                // Method 2: If no geometry found, try with view-specific options
                if (geometryData.Vertices.Count == 0)
                {
                    var views3D = new FilteredElementCollector(_document)
                        .OfClass(typeof(View3D))
                        .Cast<View3D>()
                        .Where(v => !v.IsTemplate);
                    
                    foreach (var view3D in views3D)
                    {
                        // Create new options specifically for view-based extraction
                        var viewOptions = new Options
                        {
                            View = view3D,
                            ComputeReferences = true,
                            IncludeNonVisibleObjects = true
                        };
                        
                        // Get all visible elements in this view
                        var viewElements = new FilteredElementCollector(_document, view3D.Id)
                            .WhereElementIsNotElementType()
                            .ToElements();
                        
                        foreach (Element element in viewElements)
                        {
                            var geomElem = element.get_Geometry(viewOptions);
                            if (geomElem != null)
                            {
                                foreach (GeometryObject geomObj in geomElem)
                                {
                                    ProcessGeometryObject(geomObj, geometryData, Transform.Identity);
                                }
                            }
                        }
                    }
                }
                
                // Debug: Report findings
                System.Diagnostics.Debug.WriteLine($"Processed {elementCount} elements, found geometry in {geometryCount}");
                System.Diagnostics.Debug.WriteLine($"Final vertices: {geometryData.Vertices.Count}, triangles: {geometryData.Indices.Count / 3}");
                
                // Debug info is now disabled since extraction is working
                // Uncomment the following lines if you need to debug geometry extraction again:
                /*
                var view3DCount = new FilteredElementCollector(_document)
                    .OfClass(typeof(View3D))
                    .Cast<View3D>()
                    .Where(v => !v.IsTemplate)
                    .Count();
                    
                string debugInfo = $"Debug Info:\n" +
                    $"Total elements found: {allElements.Count}\n" +
                    $"Elements with geometry: {geometryCount}\n" +
                    $"3D Views found: {view3DCount}\n" +
                    $"Final vertices: {geometryData.Vertices.Count}\n" +
                    $"Final triangles: {geometryData.Indices.Count / 3}\n\n" +
                    $"Element types found:\n";
                
                var elementTypes = allElements.GroupBy(e => e.GetType().Name).Select(g => $"{g.Key}: {g.Count()}");
                debugInfo += string.Join("\n", elementTypes);
                
                TaskDialog.Show("Geometry Extraction Debug", debugInfo);
                */
            }
            else
            {
                // For project documents, use the standard collector
                var collector = new FilteredElementCollector(_document)
                    .WhereElementIsNotElementType()
                    .Where(e => e.Category != null && e.Category.CategoryType == CategoryType.Model);

                foreach (Element element in collector)
                {
                    ProcessElement(element, geometryData, options, Transform.Identity);
                }
            }

            return geometryData;
        }

        private void ProcessElement(Element element, GeometryData geometryData, Options options, Transform transform)
        {
            var geomElem = element.get_Geometry(options);
            if (geomElem == null) return;

            foreach (GeometryObject geomObj in geomElem)
            {
                ProcessGeometryObject(geomObj, geometryData, transform);
            }
        }

        private void ProcessGeometryObject(GeometryObject geomObj, GeometryData geometryData, Transform transform)
        {
            if (geomObj is Solid solid)
            {
                ProcessSolid(solid, geometryData, transform);
            }
            else if (geomObj is GeometryInstance geomInstance)
            {
                var instanceTransform = geomInstance.Transform;
                var combinedTransform = transform.Multiply(instanceTransform);
                
                // Try both GetInstanceGeometry and GetSymbolGeometry
                var instanceGeometry = geomInstance.GetInstanceGeometry();
                if (instanceGeometry != null)
                {
                    foreach (GeometryObject instanceObj in instanceGeometry)
                    {
                        ProcessGeometryObject(instanceObj, geometryData, combinedTransform);
                    }
                }
                
                var symbolGeometry = geomInstance.GetSymbolGeometry();
                if (symbolGeometry != null)
                {
                    foreach (GeometryObject symbolObj in symbolGeometry)
                    {
                        ProcessGeometryObject(symbolObj, geometryData, combinedTransform);
                    }
                }
            }
            else if (geomObj is Mesh mesh)
            {
                ProcessMesh(mesh, geometryData, transform);
            }
            else if (geomObj is Face face)
            {
                // Sometimes geometry comes as individual faces
                ProcessFace(face, geometryData, transform);
            }
        }

        private void ProcessSolid(Solid solid, GeometryData geometryData, Transform transform)
        {
            if (solid == null || solid.Volume <= 0) return;

            foreach (Face face in solid.Faces)
            {
                ProcessFace(face, geometryData, transform);
            }
        }

        private void ProcessFace(Face face, GeometryData geometryData, Transform transform)
        {
            // Triangulate face at specific LOD (level of detail)
            double lod = 0.5; // Medium detail
            if (_detailLevel == ViewDetailLevel.Fine)
                lod = 1.0;
            else if (_detailLevel == ViewDetailLevel.Coarse)
                lod = 0.25;
                
            var mesh = face.Triangulate(lod);
            if (mesh == null) return;

            ProcessMesh(mesh, geometryData, transform);
        }

        private void ProcessMesh(Mesh mesh, GeometryData geometryData, Transform transform)
        {
            int baseIndex = geometryData.Vertices.Count;

            // Add vertices
            for (int i = 0; i < mesh.NumTriangles; i++)
            {
                MeshTriangle triangle = mesh.get_Triangle(i);
                
                for (int j = 0; j < 3; j++)
                {
                    XYZ vertex = triangle.get_Vertex(j);
                    XYZ transformedVertex = transform.OfPoint(vertex);
                    
                    // Convert from Revit coordinates (feet) to meters and from Z-up to Y-up
                    var position = new Vector3(
                        (float)(transformedVertex.X * FEET_TO_METERS),
                        (float)(transformedVertex.Z * FEET_TO_METERS), // Z becomes Y
                        (float)(-transformedVertex.Y * FEET_TO_METERS) // -Y becomes Z
                    );
                    
                    geometryData.Vertices.Add(position);
                    
                    // Calculate normal
                    var normal = CalculateTriangleNormal(triangle, transform);
                    geometryData.Normals.Add(normal);
                    
                    // Add default UV coordinates (can be improved based on face UV mapping)
                    geometryData.TexCoords.Add(new Vector2(0, 0));
                }
                
                // Add indices
                geometryData.Indices.Add(baseIndex + i * 3);
                geometryData.Indices.Add(baseIndex + i * 3 + 1);
                geometryData.Indices.Add(baseIndex + i * 3 + 2);
            }
        }

        private Vector3 CalculateTriangleNormal(MeshTriangle triangle, Transform transform)
        {
            XYZ v0 = transform.OfPoint(triangle.get_Vertex(0));
            XYZ v1 = transform.OfPoint(triangle.get_Vertex(1));
            XYZ v2 = transform.OfPoint(triangle.get_Vertex(2));

            XYZ edge1 = v1 - v0;
            XYZ edge2 = v2 - v0;
            XYZ normal = edge1.CrossProduct(edge2).Normalize();

            // Convert from Z-up to Y-up coordinate system
            return new Vector3(
                (float)normal.X,
                (float)normal.Z,  // Z becomes Y
                (float)-normal.Y   // -Y becomes Z
            );
        }
    }
}
