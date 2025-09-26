using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Numerics;
using SharpGLTF.Geometry;
using SharpGLTF.Geometry.VertexTypes;
using SharpGLTF.Materials;
using SharpGLTF.Scenes;
using SharpGLTF.Schema2;
using Newtonsoft.Json;
using RevitFamilyToGLB.Models;

namespace RevitFamilyToGLB.Export
{
    public class GLBExporter
    {
        public ExportResult Export(
            List<ExportedFamilyType> familyTypes,
            List<ParameterInfo> parameterSchema,
            List<ParameterRelationship> parameterRelationships,
            string outputPath)
        {
            try
            {
                // Create scene
                var scene = new SceneBuilder();
                int totalVertices = 0;
                int totalTriangles = 0;

                // Create default material
                var material = new MaterialBuilder("Default")
                    .WithBaseColor(new Vector4(0.8f, 0.8f, 0.8f, 1.0f))
                    .WithMetallicRoughness(0.1f, 0.5f)
                    .WithDoubleSide(true);

                // Process each family type
                foreach (var familyType in familyTypes)
                {
                    if (familyType.Geometry == null || familyType.Geometry.Vertices.Count == 0)
                        continue;

                    // Create mesh for this type
                    var mesh = CreateMesh(familyType.Geometry, material);
                    
                    // Add to scene as a node
                    var nodeBuilder = new SharpGLTF.Scenes.NodeBuilder(familyType.Name);
                    scene.AddRigidMesh(mesh, nodeBuilder);

                    totalVertices += familyType.Geometry.Vertices.Count;
                    totalTriangles += familyType.Geometry.Indices.Count / 3;
                }

                // Build the GLTF model
                var model = scene.ToGltf2();

                // Add metadata to asset.extras
                AddMetadata(model, familyTypes, parameterSchema, parameterRelationships);

                // Save as GLB
                model.SaveGLB(outputPath);

                var fileInfo = new FileInfo(outputPath);
                
                return new ExportResult
                {
                    Success = true,
                    TypeCount = familyTypes.Count,
                    VertexCount = totalVertices,
                    TriangleCount = totalTriangles,
                    FileSizeKB = fileInfo.Length / 1024.0
                };
            }
            catch (Exception ex)
            {
                return new ExportResult
                {
                    Success = false,
                    ErrorMessage = ex.Message
                };
            }
        }

        private IMeshBuilder<MaterialBuilder> CreateMesh(GeometryData geometry, MaterialBuilder material)
        {
            // Define vertex type (position + normal)
            var mesh = new MeshBuilder<VertexPosition, VertexEmpty, VertexEmpty>("mesh");
            var prim = mesh.UsePrimitive(material);

            // Build triangles
            for (int i = 0; i < geometry.Indices.Count; i += 3)
            {
                var idx0 = geometry.Indices[i];
                var idx1 = geometry.Indices[i + 1];
                var idx2 = geometry.Indices[i + 2];

                // Get vertices - ensure we handle both vertices and normals
                Vector3 v0, v1, v2;
                if (idx0 < geometry.Vertices.Count && idx1 < geometry.Vertices.Count && idx2 < geometry.Vertices.Count)
                {
                    v0 = geometry.Vertices[idx0];
                    v1 = geometry.Vertices[idx1];
                    v2 = geometry.Vertices[idx2];
                }
                else
                {
                    // For per-triangle vertices (not indexed properly)
                    v0 = geometry.Vertices[i];
                    v1 = geometry.Vertices[i + 1];
                    v2 = geometry.Vertices[i + 2];
                }

                // Create vertex positions
                var vp0 = new VertexPosition(v0);
                var vp1 = new VertexPosition(v1);
                var vp2 = new VertexPosition(v2);

                // Add triangle
                prim.AddTriangle(
                    (vp0, default, default),
                    (vp1, default, default),
                    (vp2, default, default)
                );
            }

            return mesh;
        }


        private void AddMetadata(
            ModelRoot model,
            List<ExportedFamilyType> familyTypes,
            List<ParameterInfo> parameterSchema,
            List<ParameterRelationship> parameterRelationships)
        {
            var metadata = new Dictionary<string, object>
            {
                ["rvt"] = new Dictionary<string, object>
                {
                    ["parameters"] = parameterSchema,
                    ["types"] = familyTypes.Select(t => new Dictionary<string, object>
                    {
                        ["name"] = t.Name,
                        ["values"] = t.ParameterValues
                    }).ToList(),
                    ["relationships"] = parameterRelationships ?? new List<ParameterRelationship>(),
                    ["units"] = new Dictionary<string, string>
                    {
                        ["length"] = "meters",
                        ["angle"] = "radians"
                    }
                }
            };

            // Add to asset extras
            var jsonString = JsonConvert.SerializeObject(metadata);
            model.Asset.Extras = jsonString;
        }
    }
}
