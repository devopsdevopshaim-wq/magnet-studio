-- DiraFinder schema
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------- raw + normalized listings ----------
CREATE TABLE IF NOT EXISTS listings (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    source          text NOT NULL,
    source_id       text NOT NULL,
    url             text,
    country         text NOT NULL DEFAULT 'IL',
    deal_type       text NOT NULL,                    -- sale | rent
    property_kind   text,
    city            text,
    neighborhood    text,
    street          text,
    house_no        text,
    lat             double precision,
    lon             double precision,
    gush            text,
    helka           text,
    price_amount    numeric,
    price_currency  text,
    price_ils       numeric,
    built_sqm       numeric,
    plot_sqm        numeric,
    balcony_sqm     numeric,
    rooms           numeric,
    floor           integer,
    total_floors    integer,
    furnished       text,                             -- yes | partial | no | unknown
    parking         integer,
    elevator        boolean,
    condition       text,
    year_built      integer,
    contact_name    text,
    contact_phone   text,
    contact_type    text,                             -- private | agency
    raw             jsonb,
    content_hash    text,                             -- to skip re-enrichment when unchanged
    first_seen_at   timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (source, source_id)
);
CREATE INDEX IF NOT EXISTS idx_listings_city_deal ON listings (city, deal_type);
CREATE INDEX IF NOT EXISTS idx_listings_price_ils ON listings (price_ils);

-- ---------- AI enrichment (1:1 with listings, latest) ----------
CREATE TABLE IF NOT EXISTS listings_enriched (
    listing_id                uuid PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,
    estimated_market_value_ils numeric,
    value_low_ils             numeric,
    value_high_ils            numeric,
    price_per_sqm_ils         numeric,
    price_per_plot_sqm_ils    numeric,
    market_gap_pct            numeric,
    valuation_confidence      numeric,
    furnished_state           text,
    furnish_value_adj_ils     numeric,
    residential_score         integer,
    investment_score          integer,
    gross_rent_yield_pct      numeric,
    recommended_use           text,                   -- residence | investment | either | unclear
    red_flags                 jsonb,
    buyer_fit_score           integer,
    rationale_he              text,
    score                     numeric,                -- 0..100 composite (Code node)
    score_breakdown           jsonb,
    model                     text,
    enriched_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_enriched_score ON listings_enriched (score DESC);

-- ---------- areas (from gov data, refreshed periodically) ----------
CREATE TABLE IF NOT EXISTS areas (
    id                   text PRIMARY KEY,            -- e.g. "IL-TLV-florentin"
    name                 text NOT NULL,
    city                 text,
    country              text DEFAULT 'IL',
    median_price_sqm_ils  numeric,
    price_trend_12m_pct   numeric,
    rent_yield_pct        numeric,
    quality_score         integer,                    -- 0..100
    transit_score         integer,
    school_score          integer,
    dominant_land_use     text,
    renewal_activity      text,                       -- none | some | high
    future_construction   jsonb,
    updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ---------- planning / plans cache (WF03) ----------
CREATE TABLE IF NOT EXISTS plans (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    gush             text,
    helka            text,
    lat              double precision,
    lon              double precision,
    active_plan      jsonb,
    land_use         text,
    building_rights  jsonb,
    pending_nearby   jsonb,
    future_construction jsonb,
    tama38           jsonb,
    pinui_binui      jsonb,
    impact_on_value  jsonb,
    summary_he       text,
    analyzed_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_plans_gush_helka ON plans (gush, helka);

-- ---------- mortgage evaluations (WF02, audit/history) ----------
CREATE TABLE IF NOT EXISTS mortgage_profiles (
    id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id     text,
    inputs         jsonb NOT NULL,
    calc           jsonb NOT NULL,
    advice         jsonb NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now()
);

-- ---------- ingest errors ----------
CREATE TABLE IF NOT EXISTS ingest_errors (
    id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    source      text,
    stage       text,
    message     text,
    payload     jsonb,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------- view the website reads ----------
CREATE OR REPLACE VIEW v_listings_public AS
SELECT l.id, l.source, l.url, l.country, l.deal_type, l.property_kind,
       l.city, l.neighborhood, l.street, l.lat, l.lon,
       l.price_ils, l.built_sqm, l.plot_sqm, l.rooms, l.floor, l.total_floors,
       l.furnished, l.parking, l.elevator, l.condition, l.year_built,
       l.contact_name, l.contact_phone, l.contact_type,
       e.estimated_market_value_ils, e.price_per_sqm_ils, e.market_gap_pct,
       e.residential_score, e.investment_score, e.recommended_use,
       e.gross_rent_yield_pct, e.red_flags, e.rationale_he, e.score, e.score_breakdown,
       l.updated_at
FROM listings l
LEFT JOIN listings_enriched e ON e.listing_id = l.id;
