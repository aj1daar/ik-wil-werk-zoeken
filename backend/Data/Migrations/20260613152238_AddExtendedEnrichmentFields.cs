using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace backend.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddExtendedEnrichmentFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CompanySize",
                table: "Sponsors",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "EnrichmentVersion",
                table: "Sponsors",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "ParentCompanyName",
                table: "Sponsors",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RemotePolicy",
                table: "Sponsors",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TargetMarket",
                table: "Sponsors",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "WebsiteUrl",
                table: "Sponsors",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "WorkingLanguage",
                table: "Sponsors",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CompanySize",
                table: "Sponsors");

            migrationBuilder.DropColumn(
                name: "EnrichmentVersion",
                table: "Sponsors");

            migrationBuilder.DropColumn(
                name: "ParentCompanyName",
                table: "Sponsors");

            migrationBuilder.DropColumn(
                name: "RemotePolicy",
                table: "Sponsors");

            migrationBuilder.DropColumn(
                name: "TargetMarket",
                table: "Sponsors");

            migrationBuilder.DropColumn(
                name: "WebsiteUrl",
                table: "Sponsors");

            migrationBuilder.DropColumn(
                name: "WorkingLanguage",
                table: "Sponsors");
        }
    }
}
