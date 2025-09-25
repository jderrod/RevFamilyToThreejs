using Autodesk.Revit.DB;

namespace RevitFamilyToGLB.Models
{
    public class ExportOptions
    {
        public string OutputFolder { get; set; }
        public ViewDetailLevel DetailLevel { get; set; } = ViewDetailLevel.Fine;
        public bool ExportCurrentTypeOnly { get; set; } = false;
        public bool EnableCompression { get; set; } = true;
    }
}
