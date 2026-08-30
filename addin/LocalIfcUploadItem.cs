using System.Collections.Generic;
using System.IO;
using Autodesk.Revit.DB;

namespace VH_IFC_QR
{
    public class LocalIfcUploadItem
    {
        public bool IsSelected { get; set; } = true;
        public string FilePath { get; set; }
        public string FileName => Path.GetFileName(FilePath);
        public string AssemblyCode { get; set; }
        public ViewSheet SelectedSheet { get; set; }
        public List<ViewSheet> AllSheets { get; set; }
    }
}
