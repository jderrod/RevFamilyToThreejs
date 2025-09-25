namespace RevitFamilyToGLB.Models
{
    public class ExportResult
    {
        public int TypeCount { get; set; }
        public int VertexCount { get; set; }
        public int TriangleCount { get; set; }
        public double FileSizeKB { get; set; }
        public bool Success { get; set; }
        public string ErrorMessage { get; set; }
    }
}
