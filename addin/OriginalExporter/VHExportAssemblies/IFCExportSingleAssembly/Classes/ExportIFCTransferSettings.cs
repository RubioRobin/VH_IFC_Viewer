using Autodesk.Revit.DB;
using Revit.IFC.Common.Enums;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace IFCExportSingleAssembly.Classes
{
    public class ExportIFCTransferSettings
    {
        public static IFCVersion TransferIFCVersion(string selectedVersion)
        {
            if (selectedVersion == "IFC 2x2 Coordination view")
            {
                return IFCVersion.IFC2x2;
            }
            else if (selectedVersion == "IFC 2x3 Coordination view")
            {
                return IFCVersion.IFC2x3;
            }
            else if (selectedVersion == "IFC 2x3 Coordination View 2.0")
            {
                return IFCVersion.IFC2x3CV2;
            }
            else if (selectedVersion == "IFC 2x3 Basic FM Handover View")
            {
                return IFCVersion.IFC2x3FM;
            }
            else if (selectedVersion == "IFC4 Reference View")
            {
                return IFCVersion.IFC4RV;
            }
            else if (selectedVersion == "IFC4x3")
            {
                return IFCVersion.IFC4x3;
            }
            else
            {
                return IFCVersion.IFC4;
            }
        }

        public static SiteTransformBasis TransferCoordinateBaseOption(string selectedOption)
        {
            if (selectedOption == "Shared Coordinates")
            {
                return SiteTransformBasis.Shared;
            }
            else if (selectedOption == "Survey Point")
            {
                return SiteTransformBasis.Site;
            }
            else if (selectedOption == "Project Base Point")
            {
                return SiteTransformBasis.Project;
            }
            else if (selectedOption == "Internal Origin")
            {
                return SiteTransformBasis.Internal;
            }
            else if (selectedOption == "Project Base Point oriented in True North")
            {
                return SiteTransformBasis.ProjectInTN;
            }
            else // "Internal Origin oriented in True North"
            {
                return SiteTransformBasis.InternalInTN;
            }
        }
    }
}
