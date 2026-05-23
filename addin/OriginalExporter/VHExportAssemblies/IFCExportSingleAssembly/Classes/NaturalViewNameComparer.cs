using System;
using System.Collections.Generic;
using System.Text;

public sealed class NaturalViewNameComparer : IComparer<string>
{
    public int Compare(string? x, string? y)
    {
        if (ReferenceEquals(x, y)) return 0;
        if (x is null) return -1;
        if (y is null) return 1;

        var ax = Tokenize(x);
        var ay = Tokenize(y);

        int i = 0;
        while (i < ax.Count && i < ay.Count)
        {
            var tx = ax[i];
            var ty = ay[i];

            if (tx.IsNumber && ty.IsNumber)
            {
                // 01 == 1
                int c = CompareNumeric(tx.Text, ty.Text);
                if (c != 0) return c;

                // ✅ géén lengte-tiebreak; laat volgende tokens beslissen
                // hierdoor staat "… 02" vóór "… 2a"
            }
            else if (tx.IsNumber != ty.IsNumber)
            {
                // nummers vóór tekst (bv. "3D(15)" vóór "3D BWK")
                return tx.IsNumber ? -1 : 1;
            }
            else
            {
                int c = string.Compare(tx.Text, ty.Text, StringComparison.OrdinalIgnoreCase);
                if (c != 0) return c;
            }
            i++;
        }

        if (ax.Count != ay.Count) return ax.Count.CompareTo(ay.Count);

        int r = x.Length.CompareTo(y.Length);
        if (r != 0) return r;
        return string.Compare(x, y, StringComparison.OrdinalIgnoreCase);
    }

    private static int CompareNumeric(string a, string b)
    {
        string za = TrimLeadingZeros(a);
        string zb = TrimLeadingZeros(b);
        if (za.Length != zb.Length) return za.Length.CompareTo(zb.Length);
        return string.Compare(za, zb, StringComparison.Ordinal);
    }

    private static string TrimLeadingZeros(string s)
    {
        int i = 0; while (i < s.Length && s[i] == '0') i++;
        return i == s.Length ? "0" : s.Substring(i);
    }

    private record Token(string Text, bool IsNumber);

    // split op alfanumerieke runs; niet-alfanum tekens (spaties, haakjes) zijn scheiders
    private static List<Token> Tokenize(string s)
    {
        var tokens = new List<Token>();
        var sb = new StringBuilder();
        bool? isNum = null;

        foreach (char ch in s)
        {
            if (char.IsLetterOrDigit(ch))
            {
                bool d = char.IsDigit(ch);
                char c = char.ToLowerInvariant(ch);

                if (isNum == null) { sb.Append(c); isNum = d; }
                else if (isNum == d) { sb.Append(c); }
                else { tokens.Add(new Token(sb.ToString(), isNum.Value)); sb.Clear(); sb.Append(c); isNum = d; }
            }
            else
            {
                if (sb.Length > 0 && isNum != null)
                { tokens.Add(new Token(sb.ToString(), isNum.Value)); sb.Clear(); isNum = null; }
            }
        }
        if (sb.Length > 0 && isNum != null) tokens.Add(new Token(sb.ToString(), isNum.Value));
        return tokens;
    }
}