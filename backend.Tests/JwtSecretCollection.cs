using Xunit;

namespace backend.Tests;

/// <summary>
/// JWT_SECRET is an environment variable, which is process-wide, and
/// TokenService reads it on every call rather than once at startup. Three test
/// classes change it: two set their own secret for the length of the class, and
/// TokenServiceTests blanks it mid-test to prove a token cannot be made or
/// checked without one. xUnit runs test classes in parallel, so without this
/// they race: a token minted under one secret is validated while another class
/// has blanked it, the controller answers 401, and a test that has nothing to do
/// with tokens fails on a machine that happened to interleave them that way.
/// Tests in one collection never run concurrently, which is all this is for.
/// </summary>
[CollectionDefinition(Name)]
public sealed class JwtSecretCollection
{
    public const string Name = "JWT_SECRET";
}
