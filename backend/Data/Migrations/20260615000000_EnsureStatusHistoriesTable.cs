using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace backend.Data.Migrations
{
    /// <inheritdoc />
    public partial class EnsureStatusHistoriesTable : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Idempotent repair migration: creates StatusHistories if the previous migration
            // was recorded as applied in __EFMigrationsHistory but the table never got created
            // due to a transaction rollback caused by the seed INSERT failing.
            migrationBuilder.Sql(@"
                CREATE TABLE IF NOT EXISTS ""StatusHistories"" (
                    ""Id""            text                        NOT NULL,
                    ""ApplicationId"" text                        NOT NULL,
                    ""UserId""        text                        NOT NULL,
                    ""Status""        text                        NOT NULL,
                    ""StatusDate""    date                        NOT NULL,
                    ""CreatedAt""     timestamp with time zone    NOT NULL,
                    CONSTRAINT ""PK_StatusHistories"" PRIMARY KEY (""Id""),
                    CONSTRAINT ""FK_StatusHistories_Stages_ApplicationId""
                        FOREIGN KEY (""ApplicationId"")
                        REFERENCES ""Stages""(""Id"")
                        ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS ""IX_StatusHistories_ApplicationId""
                    ON ""StatusHistories""(""ApplicationId"");
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"DROP TABLE IF EXISTS ""StatusHistories"";");
        }
    }
}
