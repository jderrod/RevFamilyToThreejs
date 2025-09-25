using System.Collections.Generic;

namespace RevitFamilyToGLB.Models
{
    public class ExportedFamilyType
    {
        public string Name { get; set; }
        public Dictionary<string, object> ParameterValues { get; set; }
        public GeometryData Geometry { get; set; }
    }
}
