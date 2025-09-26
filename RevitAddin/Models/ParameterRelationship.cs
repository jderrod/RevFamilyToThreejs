using System.Collections.Generic;

namespace RevitFamilyToGLB.Models
{
    public class ParameterRelationship
    {
        public string ParameterName { get; set; } = string.Empty;
        public string Formula { get; set; }
        public bool IsReporting { get; set; }
        public List<string> Dependencies { get; set; } = new List<string>();
        public List<RelationshipTarget> Targets { get; set; } = new List<RelationshipTarget>();
    }
}
