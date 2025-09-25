using System;

namespace RevitFamilyToGLB.Models
{
    public class ParameterInfo
    {
        public string Name { get; set; }
        public bool IsInstance { get; set; }
        public bool IsReporting { get; set; }
        public bool IsShared { get; set; }
        public string Guid { get; set; }
        public string StorageType { get; set; }
        public string DataType { get; set; }
        public string Formula { get; set; }
    }
}
