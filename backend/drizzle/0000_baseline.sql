CREATE TABLE "workdays" (
	"date" date PRIMARY KEY NOT NULL,
	"clock_in" time(0) NOT NULL,
	"clock_out" time(0),
	"lunch_minutes" integer,
	"half_day" boolean DEFAULT false NOT NULL,
	CONSTRAINT "workdays_clock_out_after_clock_in" CHECK ("workdays"."clock_out" IS NULL OR "workdays"."clock_out" > "workdays"."clock_in"),
	CONSTRAINT "workdays_lunch_minutes_range" CHECK ("workdays"."lunch_minutes" IS NULL OR "workdays"."lunch_minutes" BETWEEN 0 AND 1439),
	CONSTRAINT "workdays_lunch_shorter_than_span" CHECK ("workdays"."clock_out" IS NULL OR "workdays"."lunch_minutes" IS NULL OR "workdays"."lunch_minutes" * interval '1 minute' < "workdays"."clock_out" - "workdays"."clock_in")
);
