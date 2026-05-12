namespace LIBRAIN.Experiments.Stats;

// Rank-based Spearman correlation with average-rank tie handling. Implemented
// in-house to keep LIBRAIN.Experiments dependency-free (no MathNet, no SciPy
// gateway). Used by the AnalyzeCommand for the human-eval pilot's
// per-axis human-vs-LLM correlation (paper §7.7.1).
public static class SpearmanRank
{
    public static double Correlation(IReadOnlyList<double> x, IReadOnlyList<double> y)
    {
        if (x.Count != y.Count)
            throw new ArgumentException("x and y must have the same length");
        if (x.Count < 2)
            throw new ArgumentException("need at least two samples");

        var rx = AverageRanks(x);
        var ry = AverageRanks(y);
        return Pearson(rx, ry);
    }

    private static double[] AverageRanks(IReadOnlyList<double> values)
    {
        int n = values.Count;
        var indexed = values
            .Select((v, i) => (Value: v, Index: i))
            .OrderBy(p => p.Value)
            .ToArray();
        var ranks = new double[n];
        int i2 = 0;
        while (i2 < n)
        {
            int j = i2;
            while (j + 1 < n && indexed[j + 1].Value == indexed[i2].Value) j++;
            // Tie group [i2..j] gets the average rank.
            double avg = ((i2 + 1) + (j + 1)) / 2.0;
            for (int k = i2; k <= j; k++) ranks[indexed[k].Index] = avg;
            i2 = j + 1;
        }
        return ranks;
    }

    private static double Pearson(double[] a, double[] b)
    {
        double meanA = a.Average();
        double meanB = b.Average();
        double num = 0, denA = 0, denB = 0;
        for (int i = 0; i < a.Length; i++)
        {
            var da = a[i] - meanA;
            var db = b[i] - meanB;
            num += da * db;
            denA += da * da;
            denB += db * db;
        }
        var denom = Math.Sqrt(denA * denB);
        return denom == 0 ? 0 : num / denom;
    }
}
