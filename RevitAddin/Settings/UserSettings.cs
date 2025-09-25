using System;
using System.IO;
using Newtonsoft.Json;

namespace RevitFamilyToGLB.Settings
{
    public class UserSettings
    {
        public string LastOutputFolder { get; set; } = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
        public int LastDetailLevel { get; set; } = 2; // Fine
        public bool LastExportCurrentOnly { get; set; } = true;
        public bool LastEnableCompression { get; set; } = true;

        private static string SettingsPath => Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "RevitFamilyToGLB",
            "settings.json");

        public static UserSettings Load()
        {
            try
            {
                if (File.Exists(SettingsPath))
                {
                    var json = File.ReadAllText(SettingsPath);
                    return JsonConvert.DeserializeObject<UserSettings>(json);
                }
            }
            catch { }
            
            return new UserSettings();
        }

        public void Save()
        {
            try
            {
                var dir = Path.GetDirectoryName(SettingsPath);
                if (!Directory.Exists(dir))
                {
                    Directory.CreateDirectory(dir);
                }
                
                var json = JsonConvert.SerializeObject(this, Formatting.Indented);
                File.WriteAllText(SettingsPath, json);
            }
            catch { }
        }
    }
}
