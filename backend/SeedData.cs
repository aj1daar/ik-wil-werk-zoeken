using backend.Models;

namespace backend;

internal static class SeedData
{
    public static readonly SponsorCompany[] Companies =
    [
        new()
        {
            Id = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
            Name = "ASML",
            KvKNumber = "17058707",
            IsIndRecognizedSponsor = true,
            Summary = "ASML is the world's leading supplier of photolithography equipment used to manufacture semiconductor chips. Based in Veldhoven, the company produces extreme ultraviolet (EUV) machines that are essential for making the smallest and most advanced chips.",
            CoreIndustry = "Semiconductor Equipment",
            TechStackTags = ["EUV Lithography", "Optics", "Mechatronics", "C++", "Python", "High-Tech Systems"],
            FunctionalTags = ["Hardware R&D", "Manufacturing", "B2B", "Deep Tech", "Export"],
            EnrichedAt = DateTimeOffset.UtcNow,
        },
        new()
        {
            Id = "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5",
            Name = "Booking.com",
            KvKNumber = "31047344",
            IsIndRecognizedSponsor = true,
            Summary = "Booking.com is one of the world's largest online travel platforms, connecting travelers with accommodations, flights, and car rentals in over 220 countries. Headquartered in Amsterdam, it operates a massive tech platform handling millions of reservations daily.",
            CoreIndustry = "Travel & Hospitality Tech",
            TechStackTags = ["Java", "Kotlin", "Python", "AWS", "Kubernetes", "Kafka"],
            FunctionalTags = ["B2C Platform", "E-commerce", "Marketplace", "Big Data", "ML/Recommendation"],
            EnrichedAt = DateTimeOffset.UtcNow,
        },
        new()
        {
            Id = "c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6",
            Name = "Adyen",
            KvKNumber = "34259528",
            IsIndRecognizedSponsor = true,
            Summary = "Adyen is a global payment technology company that provides end-to-end payment infrastructure to large enterprises including Meta, Uber, and Spotify. Based in Amsterdam, it processes hundreds of billions of euros in transactions annually through a single unified platform.",
            CoreIndustry = "Financial Services",
            TechStackTags = ["Java", "Python", "Go", "Payments API", "Cloud", "Distributed Systems"],
            FunctionalTags = ["Fintech", "B2B SaaS", "Payments Infrastructure", "Enterprise", "Global"],
            EnrichedAt = DateTimeOffset.UtcNow,
        },
        new()
        {
            Id = "d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1",
            Name = "TomTom",
            KvKNumber = "08158031",
            IsIndRecognizedSponsor = true,
            Summary = "TomTom is a Dutch company specializing in navigation software, digital maps, and location-based services. It provides mapping data and automotive navigation solutions to car manufacturers and developers worldwide, with a growing focus on HD maps for autonomous driving.",
            CoreIndustry = "Software & Technology",
            TechStackTags = ["C++", "Python", "Cloud", "AI/ML", "Maps SDK", "Automotive"],
            FunctionalTags = ["B2B SaaS", "Automotive Tech", "Geospatial", "R&D", "Platform"],
            EnrichedAt = DateTimeOffset.UtcNow,
        },
        new()
        {
            Id = "e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
            Name = "Mollie",
            KvKNumber = "30204462",
            IsIndRecognizedSponsor = true,
            Summary = "Mollie is a Dutch payment service provider offering simple and transparent payment solutions for businesses of all sizes across Europe. It supports a wide range of payment methods including iDEAL, credit cards, SEPA, and buy-now-pay-later through a developer-friendly API.",
            CoreIndustry = "Financial Services",
            TechStackTags = ["PHP", "Python", "Go", "REST API", "Cloud", "Microservices"],
            FunctionalTags = ["Fintech", "B2B SaaS", "Payments", "SME", "API-first"],
            EnrichedAt = DateTimeOffset.UtcNow,
        },
        new()
        {
            Id = "f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3",
            Name = "Picnic",
            KvKNumber = "64982544",
            IsIndRecognizedSponsor = true,
            Summary = "Picnic is a Dutch online-only supermarket operating a fully electric delivery fleet. It uses proprietary software and data science to optimize routes, predict demand, and deliver groceries at low prices directly to customers' doors across the Netherlands, Germany, and France.",
            CoreIndustry = "Logistics & Retail Tech",
            TechStackTags = ["Java", "Kotlin", "Python", "Android", "Cloud", "Data Engineering"],
            FunctionalTags = ["E-commerce", "Logistics", "B2C", "Operations Tech", "Sustainability"],
            EnrichedAt = DateTimeOffset.UtcNow,
        },
        new()
        {
            Id = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d5",
            Name = "Coolblue",
            KvKNumber = "24438285",
            IsIndRecognizedSponsor = true,
            Summary = "Coolblue is a Dutch e-commerce retailer specializing in consumer electronics and home appliances. Known for its strong customer service culture and same-day delivery, it operates both online and through physical stores in the Netherlands and Belgium.",
            CoreIndustry = "E-commerce & Retail",
            TechStackTags = [".NET", "C#", "Azure", "Elasticsearch", "React", "SQL Server"],
            FunctionalTags = ["E-commerce", "B2C", "Retail Tech", "Logistics", "Customer Experience"],
            EnrichedAt = DateTimeOffset.UtcNow,
        },
    ];
}
