using System;
using System.IO;
using System.Windows.Forms;
using Autodesk.Revit.DB;
using RevitFamilyToGLB.Models;
using RevitFamilyToGLB.Settings;

namespace RevitFamilyToGLB.UI
{
    public partial class ExportOptionsDialog : System.Windows.Forms.Form
    {
        private Document _document;
        private TextBox _outputFolderTextBox;
        private Button _browseButton;
        private ComboBox _detailLevelCombo;
        private RadioButton _currentTypeRadio;
        private RadioButton _allTypesRadio;
        private CheckBox _compressionCheckBox;
        private Button _okButton;
        private Button _cancelButton;

        public ExportOptionsDialog(Document document)
        {
            _document = document;
            InitializeComponent();
            LoadSettings();
        }

        private void InitializeComponent()
        {
            this.Text = "Export Family to GLB";
            this.Size = new System.Drawing.Size(500, 320);
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = false;
            this.StartPosition = FormStartPosition.CenterScreen;

            // Output Folder
            var outputLabel = new Label
            {
                Text = "Output Folder:",
                Location = new System.Drawing.Point(12, 20),
                Size = new System.Drawing.Size(100, 23)
            };
            this.Controls.Add(outputLabel);

            _outputFolderTextBox = new TextBox
            {
                Location = new System.Drawing.Point(120, 20),
                Size = new System.Drawing.Size(280, 23)
            };
            this.Controls.Add(_outputFolderTextBox);

            _browseButton = new Button
            {
                Text = "Browse...",
                Location = new System.Drawing.Point(405, 19),
                Size = new System.Drawing.Size(75, 25)
            };
            _browseButton.Click += BrowseButton_Click;
            this.Controls.Add(_browseButton);

            // Detail Level
            var detailLabel = new Label
            {
                Text = "Detail Level:",
                Location = new System.Drawing.Point(12, 60),
                Size = new System.Drawing.Size(100, 23)
            };
            this.Controls.Add(detailLabel);

            _detailLevelCombo = new ComboBox
            {
                Location = new System.Drawing.Point(120, 60),
                Size = new System.Drawing.Size(150, 23),
                DropDownStyle = ComboBoxStyle.DropDownList
            };
            _detailLevelCombo.Items.AddRange(new[] { "Coarse", "Medium", "Fine" });
            _detailLevelCombo.SelectedIndex = 2; // Default to Fine
            this.Controls.Add(_detailLevelCombo);

            // Export Scope
            var scopeGroupBox = new GroupBox
            {
                Text = "Export Scope",
                Location = new System.Drawing.Point(12, 100),
                Size = new System.Drawing.Size(468, 80)
            };

            _currentTypeRadio = new RadioButton
            {
                Text = "Current Family Type Only",
                Location = new System.Drawing.Point(15, 25),
                Size = new System.Drawing.Size(200, 20),
                Checked = true
            };
            scopeGroupBox.Controls.Add(_currentTypeRadio);

            _allTypesRadio = new RadioButton
            {
                Text = "All Family Types",
                Location = new System.Drawing.Point(15, 50),
                Size = new System.Drawing.Size(200, 20)
            };
            scopeGroupBox.Controls.Add(_allTypesRadio);

            this.Controls.Add(scopeGroupBox);

            // Compression
            _compressionCheckBox = new CheckBox
            {
                Text = "Enable GLB Compression (smaller file size)",
                Location = new System.Drawing.Point(12, 195),
                Size = new System.Drawing.Size(300, 20),
                Checked = true
            };
            this.Controls.Add(_compressionCheckBox);

            // Buttons
            _okButton = new Button
            {
                Text = "Export",
                Location = new System.Drawing.Point(324, 240),
                Size = new System.Drawing.Size(75, 25),
                DialogResult = DialogResult.OK
            };
            _okButton.Click += OkButton_Click;
            this.Controls.Add(_okButton);

            _cancelButton = new Button
            {
                Text = "Cancel",
                Location = new System.Drawing.Point(405, 240),
                Size = new System.Drawing.Size(75, 25),
                DialogResult = DialogResult.Cancel
            };
            this.Controls.Add(_cancelButton);

            this.AcceptButton = _okButton;
            this.CancelButton = _cancelButton;
        }

        private void BrowseButton_Click(object sender, EventArgs e)
        {
            using (var dialog = new FolderBrowserDialog())
            {
                dialog.Description = "Select output folder for GLB file";
                if (!string.IsNullOrEmpty(_outputFolderTextBox.Text) && 
                    Directory.Exists(_outputFolderTextBox.Text))
                {
                    dialog.SelectedPath = _outputFolderTextBox.Text;
                }

                if (dialog.ShowDialog() == DialogResult.OK)
                {
                    _outputFolderTextBox.Text = dialog.SelectedPath;
                }
            }
        }

        private void OkButton_Click(object sender, EventArgs e)
        {
            // Validate output folder
            if (string.IsNullOrEmpty(_outputFolderTextBox.Text))
            {
                MessageBox.Show("Please select an output folder.", "Validation Error", 
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                this.DialogResult = DialogResult.None;
                return;
            }

            if (!Directory.Exists(_outputFolderTextBox.Text))
            {
                try
                {
                    Directory.CreateDirectory(_outputFolderTextBox.Text);
                }
                catch (Exception ex)
                {
                    MessageBox.Show($"Could not create output folder:\n{ex.Message}", 
                        "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    this.DialogResult = DialogResult.None;
                    return;
                }
            }

            SaveSettings();
        }

        public ExportOptions GetOptions()
        {
            var detailLevel = ViewDetailLevel.Fine;
            switch (_detailLevelCombo.SelectedIndex)
            {
                case 0:
                    detailLevel = ViewDetailLevel.Coarse;
                    break;
                case 1:
                    detailLevel = ViewDetailLevel.Medium;
                    break;
                case 2:
                    detailLevel = ViewDetailLevel.Fine;
                    break;
            }

            return new ExportOptions
            {
                OutputFolder = _outputFolderTextBox.Text,
                DetailLevel = detailLevel,
                ExportCurrentTypeOnly = _currentTypeRadio.Checked,
                EnableCompression = _compressionCheckBox.Checked
            };
        }

        private void LoadSettings()
        {
            var settings = UserSettings.Load();
            _outputFolderTextBox.Text = settings.LastOutputFolder;
            _detailLevelCombo.SelectedIndex = settings.LastDetailLevel;
            _currentTypeRadio.Checked = settings.LastExportCurrentOnly;
            _allTypesRadio.Checked = !settings.LastExportCurrentOnly;
            _compressionCheckBox.Checked = settings.LastEnableCompression;
        }

        private void SaveSettings()
        {
            var settings = new UserSettings
            {
                LastOutputFolder = _outputFolderTextBox.Text,
                LastDetailLevel = _detailLevelCombo.SelectedIndex,
                LastExportCurrentOnly = _currentTypeRadio.Checked,
                LastEnableCompression = _compressionCheckBox.Checked
            };
            settings.Save();
        }
    }
}
