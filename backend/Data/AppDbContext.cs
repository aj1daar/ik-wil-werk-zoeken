using backend.Models;
using Microsoft.EntityFrameworkCore;

namespace backend.Data;

public sealed class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<User> Users => Set<User>();
    public DbSet<ApplicationStage> Stages => Set<ApplicationStage>();
    public DbSet<SponsorCompany> Sponsors => Set<SponsorCompany>();
    public DbSet<ActivityLog> ActivityLogs => Set<ActivityLog>();
    public DbSet<StatusHistory> StatusHistories => Set<StatusHistory>();
    public DbSet<SyncLog> SyncLogs => Set<SyncLog>();

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

        modelBuilder.Entity<ActivityLog>(e =>
        {
            e.HasKey(a => a.Id);
            e.HasIndex(a => a.ApplicationId);
            e.HasOne<ApplicationStage>()
             .WithMany()
             .HasForeignKey(a => a.ApplicationId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<StatusHistory>(e =>
        {
            e.HasKey(h => h.Id);
            e.HasIndex(h => h.ApplicationId);
            e.HasOne<ApplicationStage>()
             .WithMany()
             .HasForeignKey(h => h.ApplicationId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<SyncLog>(e =>
        {
            e.HasKey(s => s.Id);
            e.Property(s => s.Id).ValueGeneratedOnAdd();
        });
    }
}
