namespace RevitFamilyToGLB.Models
{
    public class RelationshipTarget
    {
        public string ElementId { get; set; } = string.Empty;
        public string Category { get; set; }
        public string GeometryType { get; set; }
        public string ReferenceStableRepresentation { get; set; }
    }
}
