using System.Collections.Generic;
using System.Numerics;

namespace RevitFamilyToGLB.Models
{
    public class GeometryData
    {
        public List<Vector3> Vertices { get; set; } = new List<Vector3>();
        public List<Vector3> Normals { get; set; } = new List<Vector3>();
        public List<Vector2> TexCoords { get; set; } = new List<Vector2>();
        public List<int> Indices { get; set; } = new List<int>();
        public Matrix4x4 Transform { get; set; } = Matrix4x4.Identity;
    }
}
