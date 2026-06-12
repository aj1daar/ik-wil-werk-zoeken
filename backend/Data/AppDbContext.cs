using backend.Models;
using Microsoft.EntityFrameworkCore;

namespace backend.Data;

public sealed class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<User> Users => Set<User>();
    public DbSet<ApplicationStage> Stages => Set<ApplicationStage>();
    public DbSet<SponsorCompany> Sponsors => Set<SponsorCompany>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>(e =>
        {
            e.HasKey(u => u.UserId);
            e.HasIndex(u => u.Email).IsUnique();
        });

        modelBuilder.Entity<ApplicationStage>(e =>
        {
            e.HasKey(s => s.Id);
            e.Property(s => s.Locations).HasColumnType("text[]");
            e.HasOne<User>()
             .WithMany()
             .HasForeignKey(s => s.UserId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<SponsorCompany>(e =>
        {
            e.HasKey(s => s.Id);
            e.Property(s => s.TechStackTags).HasColumnType("text[]");
            e.Property(s => s.FunctionalTags).HasColumnType("text[]");
        });
    }
}
