using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace backend.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddStatusHistory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "StatusHistories",
                columns: table => new
                {
                    Id = table.Column<string>(type: "text", nullable: false),
                    ApplicationId = table.Column<string>(type: "text", nullable: false),
                    UserId = table.Column<string>(type: "text", nullable: false),
                    Status = table.Column<string>(type: "text", nullable: false),
                    StatusDate = table.Column<DateOnly>(type: "date", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StatusHistories", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StatusHistories_Stages_ApplicationId",
                        column: x => x.ApplicationId,
                        principalTable: "Stages",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_StatusHistories_ApplicationId",
                table: "StatusHistories",
                column: "ApplicationId");

            // Seed: create Applied entry for every existing application
            migrationBuilder.Sql(@"
                INSERT INTO ""StatusHistories"" (""Id"", ""ApplicationId"", ""UserId"", ""Status"", ""StatusDate"", ""CreatedAt"")
                SELECT
                    replace(gen_random_uuid()::text, '-', ''),
                    ""Id"",
                    ""UserId"",
                    'Applied',
                    ""AppliedAt""::date,
                    now()
                FROM ""Stages"";
            ");

            // Seed: create current-status entry for applications that moved past Applied
            migrationBuilder.Sql(@"
                INSERT INTO ""StatusHistories"" (""Id"", ""ApplicationId"", ""UserId"", ""Status"", ""StatusDate"", ""CreatedAt"")
                SELECT
                    replace(gen_random_uuid()::text, '-', ''),
                    ""Id"",
                    ""UserId"",
                    ""Status"",
                    ""UpdatedAt""::date,
                    now()
                FROM ""Stages""
                WHERE ""Status"" <> 'Applied';
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "StatusHistories");
        }
    }
}
