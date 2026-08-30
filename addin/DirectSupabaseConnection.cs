namespace VH_IFC_QR
{
    /// <summary>
    /// Deployment-owned connection details for the VH Revit workflow.
    /// The publishable Supabase key is intentionally bundled: desktop apps are
    /// public clients. Every operational request still requires a user session.
    /// </summary>
    internal static class DirectSupabaseConnection
    {
        internal const string SupabaseUrl = "https://lqkdcllyikctudrgdanp.supabase.co";
        internal const string SupabasePublishableKey = "sb_publishable_kQcW_10DAVC9iQwF7UOo5A_AawbHeZ3";
        internal const string ViewerUrl = "https://vh-ifc-viewer.vercel.app";
        internal const string AdminUrl = ViewerUrl + "/admin.html#/login";

        internal static PluginClient CreateClient()
        {
            return new PluginClient(SupabaseUrl, SupabasePublishableKey);
        }
    }
}
