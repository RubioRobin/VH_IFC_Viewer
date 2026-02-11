using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows.Forms;
using Autodesk.Revit.DB;

namespace VH_IFC_QR
{
    public class SelectionForm : System.Windows.Forms.Form
    {
        private System.Windows.Forms.ComboBox comboProjects;
        private System.Windows.Forms.ComboBox combo3DViews;
        private System.Windows.Forms.ComboBox comboSheets;
        private System.Windows.Forms.TextBox txtModelName;
        private System.Windows.Forms.ProgressBar progressBar;
        private System.Windows.Forms.Label lblStatus;
        private System.Windows.Forms.Button btnOk;
        private System.Windows.Forms.Button btnCancel;
        private System.Windows.Forms.Button btnTestConn;

        public string SelectedProjectId { get; private set; }
        public ElementId Selected3DViewId { get; private set; }
        public ElementId SelectedSheetId { get; private set; }
        public string ModelName { get { return txtModelName.Text; } }

        private List<ProjectInfo> _projects;
        private List<View3D> _views;
        private List<ViewSheet> _sheets;

        public SelectionForm(List<ProjectInfo> projects, List<View3D> views, List<ViewSheet> sheets, string defaultModelName)
        {
            _projects = projects;
            _views = views;
            _sheets = sheets;
            InitializeComponent();
            PopulateCombos();
            txtModelName.Text = defaultModelName;
        }

        private void PopulateCombos()
        {
            comboProjects.DataSource = _projects;
            comboProjects.DisplayMember = "name";
            comboProjects.ValueMember = "id";

            combo3DViews.DataSource = _views;
            combo3DViews.DisplayMember = "Name";

            comboSheets.DataSource = _sheets;
            comboSheets.DisplayMember = "Name";

            if (_projects.Count > 0) comboProjects.SelectedIndex = 0;
            if (_views.Count > 0) combo3DViews.SelectedIndex = 0;
            if (_sheets.Count > 0) comboSheets.SelectedIndex = 0;
        }

        public void UpdateStatus(string message, int progress)
        {
            if (this.InvokeRequired)
            {
                this.Invoke(new Action(() => UpdateStatus(message, progress)));
                return;
            }
            lblStatus.Text = message;
            progressBar.Value = progress;
            System.Windows.Forms.Application.DoEvents();
        }

        private void btnTestConn_Click(object sender, EventArgs e)
        {
            UpdateStatus("Testen van verbinding...", 0);
            // This will be called via an event or action from Command.cs or handled here
            // For simplicity, let's just trigger a signal that Command.cs can pick up or 
            // since this is a dialog, we might want to perform a quick check.
            // Better: Let Command.cs handle the heavy lifting.
            this.Tag = "TEST_CONNECTION";
            // We don't close the dialog, just signal.
            // Actually, let's just do a tiny local test if possible, or just let Command.cs handle it.
            // To keep it simple, btnOk is "Start Flow", let's make btnTestConn a separate functional button.
        }

        public event Action OnTestConnection;

        private void btnOk_Click(object sender, EventArgs e)
        {
            SelectedProjectId = ((ProjectInfo)comboProjects.SelectedItem).id;
            Selected3DViewId = ((View3D)combo3DViews.SelectedItem).Id;
            SelectedSheetId = ((ViewSheet)comboSheets.SelectedItem).Id;
            
            btnOk.Enabled = false;
            btnCancel.Enabled = false;
            btnTestConn.Enabled = false;
            
            this.DialogResult = DialogResult.OK;
        }

        private void InitializeComponent()
        {
            this.comboProjects = new System.Windows.Forms.ComboBox();
            this.combo3DViews = new System.Windows.Forms.ComboBox();
            this.comboSheets = new System.Windows.Forms.ComboBox();
            this.txtModelName = new System.Windows.Forms.TextBox();
            this.progressBar = new System.Windows.Forms.ProgressBar();
            this.lblStatus = new System.Windows.Forms.Label();
            this.btnOk = new System.Windows.Forms.Button();
            this.btnCancel = new System.Windows.Forms.Button();
            this.btnTestConn = new System.Windows.Forms.Button();
            
            var lblProj = new Label() { Text = "Project:", Location = new System.Drawing.Point(20, 20), Size = new System.Drawing.Size(340, 20) };
            this.comboProjects.Location = new System.Drawing.Point(20, 40);
            this.comboProjects.Size = new System.Drawing.Size(340, 25);
            this.comboProjects.DropDownStyle = ComboBoxStyle.DropDownList;

            var lblView = new Label() { Text = "3D View voor IFC:", Location = new System.Drawing.Point(20, 75), Size = new System.Drawing.Size(340, 20) };
            this.combo3DViews.Location = new System.Drawing.Point(20, 95);
            this.combo3DViews.Size = new System.Drawing.Size(340, 25);
            this.combo3DViews.DropDownStyle = ComboBoxStyle.DropDownList;

            var lblSheet = new Label() { Text = "Sheet voor QR-plaatsing:", Location = new System.Drawing.Point(20, 130), Size = new System.Drawing.Size(340, 20) };
            this.comboSheets.Location = new System.Drawing.Point(20, 150);
            this.comboSheets.Size = new System.Drawing.Size(340, 25);
            this.comboSheets.DropDownStyle = ComboBoxStyle.DropDownList;

            var lblName = new Label() { Text = "Model Naam:", Location = new System.Drawing.Point(20, 185), Size = new System.Drawing.Size(340, 20) };
            this.txtModelName.Location = new System.Drawing.Point(20, 205);
            this.txtModelName.Size = new System.Drawing.Size(340, 25);

            this.lblStatus.Location = new System.Drawing.Point(20, 240);
            this.lblStatus.Size = new System.Drawing.Size(340, 20);
            this.lblStatus.Text = "Klaar voor start";

            this.progressBar.Location = new System.Drawing.Point(20, 260);
            this.progressBar.Size = new System.Drawing.Size(340, 20);

            this.btnOk.Location = new System.Drawing.Point(170, 300);
            this.btnOk.Size = new System.Drawing.Size(90, 30);
            this.btnOk.Text = "Start Flow";
            this.btnOk.Click += new System.EventHandler(this.btnOk_Click);

            this.btnCancel.Location = new System.Drawing.Point(270, 300);
            this.btnCancel.Size = new System.Drawing.Size(90, 30);
            this.btnCancel.Text = "Annuleren";
            this.btnCancel.DialogResult = DialogResult.Cancel;

            this.btnTestConn.Location = new System.Drawing.Point(20, 300);
            this.btnTestConn.Size = new System.Drawing.Size(120, 30);
            this.btnTestConn.Text = "Test Verbinding";
            this.btnTestConn.Click += (s, e) => OnTestConnection?.Invoke();

            this.ClientSize = new System.Drawing.Size(380, 350);
            this.Controls.Add(lblProj); this.Controls.Add(this.comboProjects);
            this.Controls.Add(lblView); this.Controls.Add(this.combo3DViews);
            this.Controls.Add(lblSheet); this.Controls.Add(this.comboSheets);
            this.Controls.Add(lblName); this.Controls.Add(this.txtModelName);
            this.Controls.Add(this.lblStatus); this.Controls.Add(this.progressBar);
            this.Controls.Add(this.btnOk);
            this.Controls.Add(this.btnCancel);
            this.Controls.Add(this.btnTestConn);
            
            this.Text = "VH IFC Viewer - Revit Add-in";
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = false;
        }
    }
}
