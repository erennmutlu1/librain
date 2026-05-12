using System.Text.Json.Serialization;

namespace LIBRAIN.Experiments.Models;

public sealed record TopicPair(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("topicA")] string TopicA,
    [property: JsonPropertyName("topicB")] string TopicB,
    [property: JsonPropertyName("category")] string Category,
    [property: JsonPropertyName("humanEvalIncluded")] bool HumanEvalIncluded);

public sealed record TopicPairList(
    [property: JsonPropertyName("pairs")] IReadOnlyList<TopicPair> Pairs);
