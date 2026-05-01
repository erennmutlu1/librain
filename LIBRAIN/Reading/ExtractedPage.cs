namespace LIBRAIN.Reading;

public sealed record ExtractedPage(int PageNumber, string Text, int StartOffset);

public sealed record ExtractedDocument(string FullText, IReadOnlyList<ExtractedPage> Pages);
