using Autodesk.Revit.DB;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace IFCExportSingleAssembly.Classes
{
    public class SuppressAllWarningsPreprocessor : IFailuresPreprocessor
    {
        // je preprocessor checkt if ( f.GetSeverity() == FailureSeverity.Warning ) en voert dan
        // fa.DeleteWarning( f ) uit. 
        // Deze melding ( "Edits caused the last instance of an assembly type to be deleted..." ) 
        // is een warning en wordt dus in prcies hetzelfde filter afgevangen als de " Detachted from grid " melding. 
        // Omdat de SetFailuresPreprocessor() bij je eerste transactie (t1) zit, wordt 
        // ook deze warning tijdens assembly.Disassemble() direct weggehaald voordat Revit 'm toont

        public FailureProcessingResult PreprocessFailures(FailuresAccessor fa)
        {
            var failures = fa.GetFailureMessages();
            foreach (var f in failures)
            {
                if (f.GetSeverity() == FailureSeverity.Warning)
                {
                    // Verwijdert de warming zoals "OK" in de dialog
                    fa.DeleteWarning(f);
                }
                // Errors/Severe/DocCorruption laten we met rust (die kun je niet veilig wegdrukken)
            }

            // Ga gewoon door met de commit; als er nog errors zijn beslist Revit verder
            return FailureProcessingResult.Continue;
        }
    }
}
