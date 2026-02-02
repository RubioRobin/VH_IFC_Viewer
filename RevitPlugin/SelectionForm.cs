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

        public ElementId Selected3DViewId { get; private set; }
        public ElementId SelectedSheetId { get; private set; }

        private List<View3D> _views;
        private List<ViewSheet> _sheets;

        public SelectionForm(List<View3D> views, List<ViewSheet> sheets)
        {
            _views = views;
            _sheets = sheets;
            InitializeComponent();
            PopulateCombos();
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
        }

        private void btnOk_Click(object sender, EventArgs e)
        {
            Selected3DViewId = (_views[combo3DViews.SelectedIndex]).Id;
            SelectedSheetId = (_sheets[comboSheets.SelectedIndex]).Id;
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
            this.SuspendLayout();
            
            // label1
            this.label1.Location = new System.Drawing.Point(20, 20);
            this.label1.Size = new System.Drawing.Size(250, 20);
            this.label1.Text = "Kies 3D View voor export:";
            
            // combo3DViews
            this.combo3DViews.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
            this.combo3DViews.FormattingEnabled = true;
            this.combo3DViews.Location = new System.Drawing.Point(20, 45);
            this.combo3DViews.Size = new System.Drawing.Size(340, 25);
            
            // label2
            this.label2.Location = new System.Drawing.Point(20, 85);
            this.label2.Size = new System.Drawing.Size(250, 20);
            this.label2.Text = "Kies Sheet voor QR-code:";
            
            // comboSheets
            this.comboSheets.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
            this.comboSheets.FormattingEnabled = true;
            this.comboSheets.Location = new System.Drawing.Point(20, 110);
            this.comboSheets.Size = new System.Drawing.Size(340, 25);
            
            // btnOk
            this.btnOk.Location = new System.Drawing.Point(180, 160);
            this.btnOk.Size = new System.Drawing.Size(85, 30);
            this.btnOk.Text = "Start";
            this.btnOk.UseVisualStyleBackColor = true;
            this.btnOk.Click += new System.EventHandler(this.btnOk_Click);
            
            // btnCancel
            this.btnCancel.Location = new System.Drawing.Point(275, 160);
            this.btnCancel.Size = new System.Drawing.Size(85, 30);
            this.btnCancel.Text = "Annuleren";
            this.btnCancel.UseVisualStyleBackColor = true;
            this.btnCancel.DialogResult = DialogResult.Cancel;
            
            // SelectionForm
            this.ClientSize = new System.Drawing.Size(390, 210);
            this.Controls.Add(this.label1);
            this.Controls.Add(this.combo3DViews);
            this.Controls.Add(this.label2);
            this.Controls.Add(this.comboSheets);
            this.Controls.Add(this.btnOk);
            this.Controls.Add(this.btnCancel);
            this.Name = "SelectionForm";
            this.Text = "VH IFC Viewer - View Selectie";
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = false;
            this.ResumeLayout(false);
        }
    }
}
