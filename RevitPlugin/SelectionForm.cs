using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows.Forms;
using Autodesk.Revit.DB;

namespace VH_IFC_QR
{
    public class SelectionForm : System.Windows.Forms.Form
    {
        private System.Windows.Forms.ComboBox combo3DViews;
        private System.Windows.Forms.ComboBox comboSheets;
        private System.Windows.Forms.Button btnOk;
        private System.Windows.Forms.Button btnCancel;
        private System.Windows.Forms.Label label1;
        private System.Windows.Forms.Label label2;
        private System.Windows.Forms.Label label3;
        private System.Windows.Forms.Label label4; // New Label
        private System.Windows.Forms.TextBox txtFolder;
        private System.Windows.Forms.TextBox txtProjectId; // New TextBox
        private System.Windows.Forms.Button btnBrowse;

        public ElementId Selected3DViewId { get; private set; }
        public ElementId SelectedSheetId { get; private set; }
        public string SelectedFolder { get { return txtFolder.Text; } }
        public string SelectedProjectId { get { return txtProjectId.Text.Trim(); } } // New Property

        private List<View3D> _views;
        private List<ViewSheet> _sheets;

        public SelectionForm(List<View3D> views, List<ViewSheet> sheets)
        {
            _views = views;
            _sheets = sheets;
            InitializeComponent();
            PopulateCombos();
            LoadLastProjectId();
        }

        private void LoadLastProjectId()
        {
            // Simple persistence: try to read from a temp file or just default to empty
            try
            {
                string tempPath = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "vh_ifc_last_project_id.txt");
                if (System.IO.File.Exists(tempPath))
                {
                    txtProjectId.Text = System.IO.File.ReadAllText(tempPath).Trim();
                }
            }
            catch { }
        }

        private void SaveLastProjectId()
        {
            try
            {
                string tempPath = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "vh_ifc_last_project_id.txt");
                System.IO.File.WriteAllText(tempPath, txtProjectId.Text.Trim());
            }
            catch { }
        }

        private void PopulateCombos()
        {
            combo3DViews.DataSource = _views;
            combo3DViews.DisplayMember = "Name";
            
            comboSheets.DataSource = _sheets;
            comboSheets.DisplayMember = "Name";

            // Default selections
            if (_views.Count > 0) combo3DViews.SelectedIndex = 0;
            if (_sheets.Count > 0) comboSheets.SelectedIndex = 0;
            
            // Default folder: Desktop
            txtFolder.Text = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
        }

        private void btnBrowse_Click(object sender, EventArgs e)
        {
            using (var fbd = new FolderBrowserDialog())
            {
                if (fbd.ShowDialog() == DialogResult.OK && !string.IsNullOrWhiteSpace(fbd.SelectedPath))
                {
                    txtFolder.Text = fbd.SelectedPath;
                }
            }
        }

        private void btnOk_Click(object sender, EventArgs e)
        {
            if (string.IsNullOrWhiteSpace(txtProjectId.Text))
            {
                MessageBox.Show("Vul a.u.b. een Project ID in.", "Fout", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            // Basic validation for UUID format could be added here
            
            Selected3DViewId = (_views[combo3DViews.SelectedIndex]).Id;
            SelectedSheetId = (_sheets[comboSheets.SelectedIndex]).Id;
            SaveLastProjectId(); // Save for next time
            this.DialogResult = DialogResult.OK;
            this.Close();
        }

        private void InitializeComponent()
        {
            this.combo3DViews = new System.Windows.Forms.ComboBox();
            this.comboSheets = new System.Windows.Forms.ComboBox();
            this.btnOk = new System.Windows.Forms.Button();
            this.btnCancel = new System.Windows.Forms.Button();
            this.label1 = new System.Windows.Forms.Label();
            this.label2 = new System.Windows.Forms.Label();
            this.label3 = new System.Windows.Forms.Label();
            this.label4 = new System.Windows.Forms.Label(); // New
            this.txtFolder = new System.Windows.Forms.TextBox();
            this.txtProjectId = new System.Windows.Forms.TextBox(); // New
            this.btnBrowse = new System.Windows.Forms.Button();
            this.SuspendLayout();
            
            // 
            // label4 (Project ID) - Move everything else down
            // 
            this.label4.Location = new System.Drawing.Point(20, 15);
            this.label4.Size = new System.Drawing.Size(250, 20);
            this.label4.Text = "Project ID (uit Dashboard):";
            
            // txtProjectId
            this.txtProjectId.Location = new System.Drawing.Point(20, 35);
            this.txtProjectId.Size = new System.Drawing.Size(340, 25);
            
            // label1 (3D View)
            this.label1.Location = new System.Drawing.Point(20, 70);
            this.label1.Size = new System.Drawing.Size(250, 20);
            this.label1.Text = "Kies 3D View voor export:";
            
            // combo3DViews
            this.combo3DViews.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
            this.combo3DViews.FormattingEnabled = true;
            this.combo3DViews.Location = new System.Drawing.Point(20, 90);
            this.combo3DViews.Size = new System.Drawing.Size(340, 25);
            
            // label2 (Sheet)
            this.label2.Location = new System.Drawing.Point(20, 125);
            this.label2.Size = new System.Drawing.Size(250, 20);
            this.label2.Text = "Kies Sheet voor QR-code:";
            
            // comboSheets
            this.comboSheets.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
            this.comboSheets.FormattingEnabled = true;
            this.comboSheets.Location = new System.Drawing.Point(20, 145);
            this.comboSheets.Size = new System.Drawing.Size(340, 25);

            // label3 (Folder)
            this.label3.Location = new System.Drawing.Point(20, 180);
            this.label3.Size = new System.Drawing.Size(250, 20);
            this.label3.Text = "Export Map:";

            // txtFolder
            this.txtFolder.Location = new System.Drawing.Point(20, 200);
            this.txtFolder.Size = new System.Drawing.Size(255, 25);
            this.txtFolder.ReadOnly = true;

            // btnBrowse
            this.btnBrowse.Location = new System.Drawing.Point(285, 198);
            this.btnBrowse.Size = new System.Drawing.Size(75, 28);
            this.btnBrowse.Text = "Kies...";
            this.btnBrowse.Click += new System.EventHandler(this.btnBrowse_Click);
            
            // btnOk
            this.btnOk.Location = new System.Drawing.Point(180, 245);
            this.btnOk.Size = new System.Drawing.Size(85, 30);
            this.btnOk.Text = "Start";
            this.btnOk.UseVisualStyleBackColor = true;
            this.btnOk.Click += new System.EventHandler(this.btnOk_Click);
            
            // btnCancel
            this.btnCancel.Location = new System.Drawing.Point(275, 245);
            this.btnCancel.Size = new System.Drawing.Size(85, 30);
            this.btnCancel.Text = "Annuleren";
            this.btnCancel.UseVisualStyleBackColor = true;
            this.btnCancel.DialogResult = DialogResult.Cancel;
            
            // SelectionForm
            this.ClientSize = new System.Drawing.Size(390, 300); // Increased height
            this.Controls.Add(this.label4);
            this.Controls.Add(this.txtProjectId);
            this.Controls.Add(this.label1);
            this.Controls.Add(this.combo3DViews);
            this.Controls.Add(this.label2);
            this.Controls.Add(this.comboSheets);
            this.Controls.Add(this.label3);
            this.Controls.Add(this.txtFolder);
            this.Controls.Add(this.btnBrowse);
            this.Controls.Add(this.btnOk);
            this.Controls.Add(this.btnCancel);
            this.Name = "SelectionForm";
            this.Text = "VH IFC Viewer - View Selectie";
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = false;
            this.ResumeLayout(false);
            this.PerformLayout();
        }
    }
}
