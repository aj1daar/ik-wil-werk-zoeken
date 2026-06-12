using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace backend.Data.Migrations
{
    /// <inheritdoc />
    public partial class ApplicationTracker : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "SponsorCompanyId",
                table: "Stages",
                newName: "Position");

            migrationBuilder.RenameColumn(
                name: "Cities",
                table: "Stages",
                newName: "Locations");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "AppliedAt",
                table: "Stages",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTimeOffset(new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.AddColumn<string>(
                name: "CompanyName",
                table: "Stages",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "RejectionNote",
                table: "Stages",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RejectionReason",
                table: "Stages",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AppliedAt",
                table: "Stages");

            migrationBuilder.DropColumn(
                name: "CompanyName",
                table: "Stages");

            migrationBuilder.DropColumn(
                name: "RejectionNote",
                table: "Stages");

            migrationBuilder.DropColumn(
                name: "RejectionReason",
                table: "Stages");

            migrationBuilder.RenameColumn(
                name: "Position",
                table: "Stages",
                newName: "SponsorCompanyId");

            migrationBuilder.RenameColumn(
                name: "Locations",
                table: "Stages",
                newName: "Cities");
        }
    }
}
