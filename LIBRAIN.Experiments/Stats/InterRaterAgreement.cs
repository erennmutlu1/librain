namespace LIBRAIN.Experiments.Stats;

// Inter-rater agreement, in code (Task 5). Replaces the hand-authored kappa.csv:
// Cohen's kappa (2 raters), Fleiss' kappa (>=3 raters), and Krippendorff's alpha
// (nominal + ordinal). Each returns a status string so the zero/low-variance cases
// (e.g. every rater flags 0 hallucinations) are reported as "undefined" rather than a
// misleading number. Pure functions, no dependencies — testable without HTTP.
public static class InterRaterAgreement
{
    public sealed record Agreement(double? Value, double ObservedAgreement, string Status);

    // Cohen's kappa for two raters over categorical codes.
    public static Agreement CohensKappa(IReadOnlyList<int> a, IReadOnlyList<int> b)
    {
        if (a.Count != b.Count) throw new ArgumentException("rater vectors must be equal length");
        int n = a.Count;
        if (n == 0) return new Agreement(null, 0, "undefined: no items");

        int agree = 0;
        for (int i = 0; i < n; i++) if (a[i] == b[i]) agree++;
        double po = (double)agree / n;

        var cats = a.Concat(b).Distinct().ToList();
        double pe = 0;
        foreach (var c in cats)
        {
            double pa = a.Count(x => x == c) / (double)n;
            double pb = b.Count(x => x == c) / (double)n;
            pe += pa * pb;
        }

        if (1 - pe == 0)
            return new Agreement(null, po, "undefined: zero variance (raters used a single category)");
        return new Agreement((po - pe) / (1 - pe), po, "ok");
    }

    // Fleiss' kappa: ratings[item] = the category each rater assigned (same rater
    // count per item). categories = the full code set.
    public static Agreement FleissKappa(IReadOnlyList<IReadOnlyList<int>> ratings, IReadOnlyList<int> categories)
    {
        int n = ratings.Count;
        if (n == 0) return new Agreement(null, 0, "undefined: no items");
        int m = ratings[0].Count;
        if (m < 2) return new Agreement(null, 0, "undefined: need >=2 raters");
        if (ratings.Any(r => r.Count != m)) throw new ArgumentException("every item needs the same number of raters");

        var cats = categories.Distinct().ToList();
        // n_ij = count of raters assigning category j to item i.
        double sumPi = 0;
        var colTotals = new Dictionary<int, int>();
        foreach (var c in cats) colTotals[c] = 0;
        foreach (var item in ratings)
        {
            int sumSq = 0;
            foreach (var c in cats)
            {
                int nij = item.Count(x => x == c);
                sumSq += nij * nij;
                colTotals[c] += nij;
            }
            sumPi += (sumSq - m) / (double)(m * (m - 1));
        }
        double pBar = sumPi / n;
        double pe = cats.Sum(c => Math.Pow(colTotals[c] / (double)(n * m), 2));

        // Observed agreement proxy for reporting.
        double po = pBar;
        if (1 - pe == 0)
            return new Agreement(null, po, "undefined: zero variance (all ratings in one category)");
        return new Agreement((pBar - pe) / (1 - pe), po, "ok");
    }

    public enum Metric { Nominal, Ordinal }

    // Krippendorff's alpha over a rater x item matrix; null = missing rating.
    // Supports nominal and ordinal difference functions. Complete or missing data.
    public static Agreement KrippendorffAlpha(int?[][] data, Metric metric)
    {
        int raters = data.Length;
        if (raters < 2) return new Agreement(null, 0, "undefined: need >=2 raters");
        int items = data[0].Length;

        // Coincidence matrix over value codes present in the data.
        var values = data.SelectMany(r => r).Where(v => v.HasValue).Select(v => v!.Value).Distinct().OrderBy(v => v).ToList();
        if (values.Count == 0) return new Agreement(null, 0, "undefined: no ratings");
        if (values.Count == 1) return new Agreement(null, 1.0, "undefined: zero variance (single value across all raters)");
        var idx = values.Select((v, i) => (v, i)).ToDictionary(t => t.v, t => t.i);
        int V = values.Count;
        var o = new double[V, V];

        double nTotal = 0;
        for (int u = 0; u < items; u++)
        {
            var col = new List<int>();
            for (int r = 0; r < raters; r++)
                if (data[r][u].HasValue) col.Add(data[r][u]!.Value);
            int mu = col.Count;
            if (mu < 2) continue; // unit needs >=2 ratings
            // pairable: each ordered pair from distinct slots, weight 1/(mu-1)
            for (int p = 0; p < col.Count; p++)
                for (int q = 0; q < col.Count; q++)
                    if (p != q) o[idx[col[p]], idx[col[q]]] += 1.0 / (mu - 1);
            nTotal += mu;
        }

        var nv = new double[V];
        double n = 0;
        for (int i = 0; i < V; i++) { for (int j = 0; j < V; j++) nv[i] += o[i, j]; n += nv[i]; }
        if (n < 2) return new Agreement(null, 0, "undefined: <2 pairable ratings");

        double Delta(int i, int j)
        {
            if (metric == Metric.Nominal) return i == j ? 0 : 1;
            // Ordinal metric (Krippendorff): squared distance via cumulative counts.
            int lo = Math.Min(i, j), hi = Math.Max(i, j);
            double s = 0;
            for (int g = lo; g <= hi; g++) s += nv[g];
            s -= (nv[i] + nv[j]) / 2.0;
            return s; // returned value is the ordinal difference; squared below
        }

        double doNum = 0, deNum = 0;
        for (int i = 0; i < V; i++)
            for (int j = 0; j < V; j++)
            {
                double d = Delta(i, j);
                double d2 = metric == Metric.Ordinal ? d * d : d; // nominal already 0/1
                doNum += o[i, j] * d2;
                deNum += nv[i] * nv[j] * d2;
            }

        double Do = doNum / n;
        double De = deNum / (n * (n - 1));
        if (De == 0) return new Agreement(null, 1.0, "undefined: zero expected disagreement");
        double alpha = 1 - Do / De;
        return new Agreement(alpha, double.NaN, "ok");
    }
}
