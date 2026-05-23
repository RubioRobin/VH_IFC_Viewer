using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using IFCExportSingleAssembly.Classes;
using IFCExportSingleAssemblyUI.Model;
using System.Collections;
using System.Windows;
using db = Autodesk.Revit.DB;

namespace IFCExportSingleAssembly
{
    // let op
    // addin neemt aan dat er al sheets van de assembly zijn gemaakt
    // op basis van de sheet filtert hij de juiste assembly
    // dat de filter 'VH Assembly Code (assembly naam) al bestaat
    // het script maakt namelijk geen nieuwe filter aan
    
    // nog te doen
    // wanneer bij assembly de cb assembly code parameter gelijk is aan de assembly naam
    // in de 3D view niet de VH maar de CB Assembly Code filter toepassen

    [TransactionAttribute(TransactionMode.Manual)]
    public class ExecuteAddin : IExternalCommand
    {
        public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
        {
            // Get UIDocument
            UIDocument uidoc = commandData.Application.ActiveUIDocument;

            // Get Document
            db.Document doc = uidoc.Document;

            // Revit version controle
            string revitVersionNumber = doc.Application.VersionNumber;
            if (revitVersionNumber == "2021" ||
                revitVersionNumber == "2022" ||
                revitVersionNumber == "2023" ||
                revitVersionNumber == "2024")
            {
                message = "addin in enkel te gebruiken in Revit 2025 en later";
                return Result.Cancelled;
            }

            // Get all assembly intances in the open view
            IEnumerable<db.AssemblyInstance> AllAssembliesInOpenView = GetAssemblies.GetAllAssemliesInCurrentView(doc);

            // Get all sheets
            IEnumerable<db.ViewSheet> AllSheets = GetSheets.GetAllSheets(doc);

            // Filter at least 1 assembly in active view
            if (AllAssembliesInOpenView.Count() < 1 || AllSheets.Count() < 1)
            {
                message = "de huidige view bevat geen assembly instances of project bevat geen sheets";
                return Result.Failed;
            }

            // Get all the unique designphases in the current open project
            // who starts with '15.'
            var uniqueDesignphases = GetDesignphases.GetUniqueDesignPhasesFromSheets(doc);

            var comparer = new NaturalViewNameComparer();

            // is checked is altijd false wanneer de UI opstart
            var viewItems = uniqueDesignphases
              .OrderBy(v => v, comparer) // ← natuurlijke sortering
              .Select(v => new IfcViewItem
              {
                  ViewId = 1000,
                  ViewName = v,
                  IsChecked = false,
              })
              .ToList();

            // Compose viewmodels in de add-in (composition root)
            var exportVm = new IFCExportSingleAssemblyUI.ViewModels.ExportIFCViewModel(viewItems);
            var config =   new IFCExportSingleAssemblyUI.Services.AddinConfigSettings();
            var mainVm =   new IFCExportSingleAssemblyUI.ViewModels.MainWindowViewModel(exportVm, config);

            // Window tonen met vooraf samengestelde VM's
            var dialog = new IFCExportSingleAssemblyUI.MainWindow { DataContext = mainVm };

            // if user cancels the UI
            bool? result = dialog.ShowDialog();
            if (result != true) return Result.Succeeded;

            // ✔ Aangevinkt ophalen uit dezelfde VM-instantie
            var checkedItems = exportVm.GetChecked().ToList();
            var selectedNames = checkedItems.Select(x => x.ViewName).ToList();

            if (selectedNames == null || selectedNames.Count == 0)
            {
                return Result.Succeeded;
            }

            // haalt alle sheets op die bij de designphase(s) horen
            // hij filtert alle sheets weg welke beginnen met een cijfer
            var allSheetsBasedOnDesignphases = GetSheets.GetSheetsByDesignPhases(doc, selectedNames);
            //TaskDialog.Show("info", $"{allSheetsBasedOnDesignphases.Count}");

            // haalt alle juiste assemblies op, op basis van de sheets
            // waarbij de VH Assembly Code gelijk is aan de assembly name
            var filteredAssemblies = GetAssemblies.GetAssembliesBySheets(doc, allSheetsBasedOnDesignphases);
            //TaskDialog.Show("info", $"assembly count: {filteredAssemblies.Count}");

            // haal alle aangevinkte designphases op
            // haal op basis van de aangevinkte designphases de sheets op
            // op basis van de sheets haal de asssemblies op
            // maak de 3D views aan
            // pas de filter toe bij de 3D views op basis van de een referentie filter
            var _3DViews = Assembly3DViewCreator.CreateAssembly3DViewsFromBase3D(doc, filteredAssemblies);

            // export de 3D views naar losse IFC-bestanden
            var selectedIFCVersion = ExportIFCTransferSettings
               .TransferIFCVersion(mainVm.SelectedIfcVersion);
            var selectedCoordinateBaseOption = ExportIFCTransferSettings
                .TransferCoordinateBaseOption(mainVm.SelectedCoordinateBase);

            var exportAssemblies = mainVm.ExportAssemblies;

            // update the parameters of the filtered assembly
            if (mainVm.UpdateParameters)
            {
                //TaskDialog.Show("info", "parameters updated...");
                using (Transaction trans = new Transaction(doc, "update parameters"))
                {
                    trans.Start();

                    foreach (var selectedView in _3DViews.Values)
                    {
                        var assembliesInView = VHCreateSheets
                            .AssembliesClass.GetAllAssembliesInView(selectedView);

                        ChangeElementIFCParameters.ChangeParameters(doc, assembliesInView.ToList());
                    }

                    trans.Commit();
                }
            }

            using (TransactionGroup tg = new TransactionGroup(doc, "export IFC"))
            {
                // starts the transactiongroup
                tg.Start();

                if (exportAssemblies == false)
                {
                    // Transaction to disassemble the assemblies
                    using (Transaction t1 = new Transaction(doc, "Assembly Disassemble"))
                    {
                        // start the transaction   
                        t1.Start();

                        // delete de error meldingen
                        var fho = t1.GetFailureHandlingOptions();
                        fho.SetFailuresPreprocessor(new SuppressAllWarningsPreprocessor());

                        // Optioneel: toon mini-warnings niet tussentijds; we verwijderen ze toch
                        // (als je ze na de commit ook niet wilt zien)
                        fho.SetDelayedMiniWarnings(true);

                        // Optioneel: bij rollback de verzamelde failures weggooien
                        fho.SetClearAfterRollback(true);

                        t1.SetFailureHandlingOptions(fho);
                        // <- delete de error meldingen

                        // Dissasemble logic
                        foreach (var selectedView in _3DViews.Values)
                        {
                            var assembliesInView = GetAssemblies
                                .GetAllAssembliesInView(selectedView);

                            foreach (var assembly in assembliesInView)
                            {
                                assembly.Disassemble();
                            }
                        }

                        // ends/ commit the transaction
                        t1.Commit();
                    }
                }

                // Transaction to disassemble the assemblies
                using (Transaction t2 = new Transaction(doc, "Export IFC"))
                {
                    // start the transaction
                    t2.Start();

                    foreach (var selectedView in _3DViews.Values)
                    {
                        ExportIFC.Export(
                            mainVm.FileExportPath,
                            selectedView,
                            selectedIFCVersion,
                            selectedCoordinateBaseOption);
                    }

                    // commit/ end the transaction
                    t2.Commit();
                }

                // rollback/ erase the changes to the model
                tg.RollBack();
            }


            //// Transaction to disassemble the assemblies
            //using (Transaction t1 = new Transaction(doc, "Export IFC"))
            //{
            //    t1.Start();

            //    foreach (var selectedView in _3DViews)
            //    {
            //        ExportIFC.Export(
            //            mainVm.FileExportPath,
            //            selectedView.Value,
            //            selectedIFCVersion,
            //            selectedCoordinateBaseOption);
            //    }

            //    t1.Commit();
            //}

            var count = _3DViews.Count;
            System.Windows.MessageBox.Show(
                $"Export completed.\n{count} view(s) exported to:\n{mainVm.FileExportPath}",
                "IFC Export",
                MessageBoxButton.OK,
                MessageBoxImage.Information
            );

            return Result.Succeeded; 
        }
    }
}
