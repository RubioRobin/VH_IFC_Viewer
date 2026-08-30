using Autodesk.Revit.Creation;
using Autodesk.Revit.DB;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Commands = VHCreateSheets.Commands;

namespace IFCExportSingleAssembly.Classes
{
    public class ChangeElementIFCParameters
    {
        public ChangeElementIFCParameters()
        {

        }

        public static void ChangeParameters(Autodesk.Revit.DB.Document doc, List<AssemblyInstance> assemblies)
        {
            string revitVersionNumber = doc.Application.VersionNumber;

            //
            // loop over all assemblies in open view
            foreach (AssemblyInstance assembly in assemblies)
            {
                // get xx parameter value from assembly
                string CBACValueAssembly = new Commands.IFCExport.CBAC(assembly).CBAssemblyCode;
                // get xx parameter value from assembly
                string VHACValueAssembly = new Commands.IFCExport.VHAC(assembly).VHACAssemblyCode;

                var allElementsAndSubInAssembly = new Commands.IFCExport.
                        Assembly(assembly).ReturnElementsWithSubInAssembly(doc);
                var allElementsInAssembly = new Commands.IFCExport.
                    Assembly(assembly).ReturnAllElementsInAssembly(doc);

                //
                // get ids of the nested components
                List<string> elementIds = new List<string>();
                foreach (Element element in allElementsInAssembly)
                {
                    FamilyInstance fInst = element as FamilyInstance;

                    // continue to the next one if fInst isn't a family instance
                    if (fInst == null)
                        continue;

                    if (fInst.GetSubComponentIds() != null)
                    {
                        var subElements = fInst.GetSubComponentIds();
                        foreach (ElementId eleId in subElements)
                        {
                            elementIds.Add(doc.GetElement(eleId).Id.ToString());
                        }
                    }
                }

                //
                // check the ids
                List<Element> filteredElementList = new List<Element>();
                foreach (Element element in allElementsInAssembly)
                {
                    string elementId = element.Id.ToString();
                    if (elementIds.Contains(elementId) == false)
                    {
                        filteredElementList.Add(element);
                    }
                }

                // get biggest element in assembly based on volume
                var biggestElementInAssembly = Commands.IFCExport.
                    PrecastElementFiltering.GetMainPrecastElement(filteredElementList);

                // if-statement if biggest element in assembly return null
                if (biggestElementInAssembly == null)
                {
                    continue;
                }

                //
                // data for the IFCExport
                // get assembly merk name
                string merknaam = new Commands.IFCExport.Merknaam().GetMerknaam(assembly);
                biggestElementInAssembly.IFCMerknaam = merknaam;
                // get material
                var materiaalObj = new Commands.IFCExport.Materiaal();
                var biggestElementMaterial = materiaalObj.PrecastMaterialFromElement(doc, biggestElementInAssembly);

                if (biggestElementMaterial == null)
                {
                    continue;
                }

                var filteredMaterialName = materiaalObj.MateriaalValue(biggestElementMaterial.Name);
                biggestElementInAssembly.IFCMateriaal = filteredMaterialName;

                // get concrete quality
                string betonkwaliteit = new Commands.IFCExport.Betonkwaliteit().GetConcreteQuality(biggestElementMaterial.Name);
                biggestElementInAssembly.IFCBetonkwaliteit = betonkwaliteit;

                // calculate volume of all elements in the assembly
                var volumeObj = new Commands.IFCExport.Volume();
                // calculate volume of only the concrete elements in the assembly
                double volumePrefab = volumeObj.CalculateVolumePrefabElements(doc, allElementsAndSubInAssembly, true);
                biggestElementInAssembly.IFCVolume = volumePrefab.ToString().Replace(',', '.');

                //double totalVolumeAssembly = volumeObj.CalculateTotalAssemblyVolume(allElementsInAssembly);
                // one mistake, the whole volume of the assembly will be multiplied by the concrete multiplier
                // what should we do with other elements e.d. steenstrips, etc. 
                //string weight = new Commands.IFCExport.Weight().CalculateWeight(doc, totalVolumeAssembly).ToString();
                // now the assembly volume (only volume of the concrete elements) will be multiplied by the value
                double volumeWeightPrefab = volumeObj.CalculateVolumePrefabElements(doc, allElementsAndSubInAssembly, false);
                string assemblyWeight = new Commands.IFCExport.Weight().CalculateWeight(doc, volumeWeightPrefab).ToString();
                biggestElementInAssembly.IFCWeight = assemblyWeight;

                // get profity id
                string profityId = new Commands.IFCExport.IfcProfityId().UniqueId(biggestElementInAssembly.Element);
                biggestElementInAssembly.IFCProfityId = profityId;

                // get nl-sfb code depending on material name (as Dynamo script)
                // used main precast element
                var precastMaterialFromBiggestElement = materiaalObj.GetMaterialWithBiggestVolume(biggestElementInAssembly.Element);
                var NLsfbValue = new Commands.IFCExport.NLsfb().GetNLSFBCodeFromMaterial(
                    doc.GetElement(precastMaterialFromBiggestElement).Name);
                biggestElementInAssembly.IFCNlsfb = NLsfbValue;

                // fill-in the IfcExportAs parameter
                var materialCommentsValue = materiaalObj.DescriptionValueFromMaterial(biggestElementMaterial);
                var assemblyType = new Commands.IFCExport.Assembly(assembly).GetTypeAssembly(materialCommentsValue);
                var ifcEportAsValue = new Commands.IFCExport.IfcExportAs().IfcExportAsValue(assemblyType);
                biggestElementInAssembly.IFCExportAs = ifcEportAsValue;

                // get assembly dimensions depending of type assembly
                List<string> assemblyDimensions = new Commands.IFCExport.AssemblyDimension().GetAssemblyDimension(doc, assembly);
                biggestElementInAssembly.IFCAssemblyBreedte = assemblyDimensions[0];
                biggestElementInAssembly.IFCAssemblyDiepte = assemblyDimensions[1];
                biggestElementInAssembly.IFCAssemblyHoogte = assemblyDimensions[2];

                //
                // overriding the parameter values of the main (precast) element in the assembly
                biggestElementInAssembly.ChangeInstanceParameter("Merknaam", biggestElementInAssembly.IFCMerknaam);
                biggestElementInAssembly.ChangeInstanceParameter("Materiaal", biggestElementInAssembly.IFCMateriaal);
                biggestElementInAssembly.ChangeInstanceParameter("Betonkwaliteit", biggestElementInAssembly.IFCBetonkwaliteit);
                biggestElementInAssembly.ChangeInstanceParameter("IfcProfityId", biggestElementInAssembly.IFCProfityId);
                biggestElementInAssembly.ChangeInstanceParameter("Weight", biggestElementInAssembly.IFCWeight);
                biggestElementInAssembly.ChangeInstanceParameter("Inhoud", biggestElementInAssembly.IFCVolume);
                biggestElementInAssembly.ChangeInstanceParameter("NL-sfb", biggestElementInAssembly.IFCNlsfb);
                biggestElementInAssembly.ChangeInstanceParameter("ElementLengte", biggestElementInAssembly.IFCAssemblyBreedte);
                biggestElementInAssembly.ChangeInstanceParameter("ElementBreedte", biggestElementInAssembly.IFCAssemblyDiepte);
                biggestElementInAssembly.ChangeInstanceParameter("ElementHoogte", biggestElementInAssembly.IFCAssemblyHoogte);

                var assemblyIFCElement = new Commands.IFCExport.ElementIFC(assembly);
                assemblyIFCElement.ChangeInstanceParameter("Merknaam", biggestElementInAssembly.IFCMerknaam);
                assemblyIFCElement.ChangeInstanceParameter("Materiaal", biggestElementInAssembly.IFCMateriaal);
                assemblyIFCElement.ChangeInstanceParameter("Betonkwaliteit", biggestElementInAssembly.IFCBetonkwaliteit);
                assemblyIFCElement.ChangeInstanceParameter("IfcProfityId", biggestElementInAssembly.IFCProfityId);
                assemblyIFCElement.ChangeInstanceParameter("Weight", biggestElementInAssembly.IFCWeight);
                assemblyIFCElement.ChangeInstanceParameter("Inhoud", biggestElementInAssembly.IFCVolume);
                assemblyIFCElement.ChangeInstanceParameter("NL-sfb", biggestElementInAssembly.IFCNlsfb);
                assemblyIFCElement.ChangeInstanceParameter("ElementLengte", biggestElementInAssembly.IFCAssemblyBreedte);
                assemblyIFCElement.ChangeInstanceParameter("ElementBreedte", biggestElementInAssembly.IFCAssemblyDiepte);
                assemblyIFCElement.ChangeInstanceParameter("ElementHoogte", biggestElementInAssembly.IFCAssemblyHoogte);

                string versionNumber = doc.Application.VersionNumber;
                string IfcExportAsParamName = "Export to IFC As";
                if (versionNumber == "2025")
                {
                    biggestElementInAssembly.ChangeInstanceParameter
                        (IfcExportAsParamName, biggestElementInAssembly.IFCExportAs);

                    assemblyIFCElement.ChangeInstanceParameter
                        (IfcExportAsParamName, biggestElementInAssembly.IFCExportAs);
                }

                // loop over each element in the allElementsInAssembly list
                // only for teh CB en VH assembly Code parameters
                foreach (Element element in allElementsAndSubInAssembly)
                {
                    var CBACObject = new Commands.IFCExport.CBAC(element)
                    {
                        CBAssemblyCode = CBACValueAssembly,
                    };

                    CBACObject.UpdateValue();


                    var VHACObject = new Commands.IFCExport.VHAC(element)
                    {
                        VHACAssemblyCode = VHACValueAssembly,
                    };

                    VHACObject.UpdateValue();
                }

                assemblyIFCElement.ChangeInstanceParameter
                        ("CBAC", CBACValueAssembly);

                assemblyIFCElement.ChangeInstanceParameter
                       ("VHAC", VHACValueAssembly);
            }
        }
    }
}
