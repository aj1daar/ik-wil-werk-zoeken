using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace backend.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddCompanyMerge : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string[]>(
                name: "AliasNames",
                table: "Sponsors",
                type: "text[]",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "MergedIntoId",
                table: "Sponsors",
                type: "text",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Sponsors_MergedIntoId",
                table: "Sponsors",
                column: "MergedIntoId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Sponsors_MergedIntoId",
                table: "Sponsors");

            migrationBuilder.DropColumn(
                name: "MergedIntoId",
                table: "Sponsors");

            migrationBuilder.DropColumn(
                name: "AliasNames",
                table: "Sponsors");
        }
    }
}
