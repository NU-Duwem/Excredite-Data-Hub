-- ============================================================
-- EPDH - Seed Data
-- Run this in the Supabase SQL Editor AFTER 01_supabase_backend_setup.sql
-- ============================================================

-- ============================================================
-- 1. STATES (36 states + FCT = 37 rows)
-- ============================================================
INSERT INTO public.states (name, code, geopolitical_zone) VALUES
    ('Abia',        'AB', 'South East'),
    ('Adamawa',     'AD', 'North East'),
    ('Akwa Ibom',   'AK', 'South South'),
    ('Anambra',     'AN', 'South East'),
    ('Bauchi',      'BA', 'North East'),
    ('Bayelsa',     'BY', 'South South'),
    ('Benue',       'BN', 'North Central'),
    ('Borno',       'BO', 'North East'),
    ('Cross River', 'CR', 'South South'),
    ('Delta',       'DE', 'South South'),
    ('Ebonyi',      'EB', 'South East'),
    ('Edo',         'ED', 'South South'),
    ('Ekiti',       'EK', 'South West'),
    ('Enugu',       'EN', 'South East'),
    ('FCT',         'FC', 'North Central'),
    ('Gombe',       'GO', 'North East'),
    ('Imo',         'IM', 'South East'),
    ('Jigawa',      'JI', 'North West'),
    ('Kaduna',      'KD', 'North West'),
    ('Kano',        'KN', 'North West'),
    ('Katsina',     'KT', 'North West'),
    ('Kebbi',       'KB', 'North West'),
    ('Kogi',        'KO', 'North Central'),
    ('Kwara',       'KW', 'North Central'),
    ('Lagos',       'LA', 'South West'),
    ('Nasarawa',    'NA', 'North Central'),
    ('Niger',       'NI', 'North Central'),
    ('Ogun',        'OG', 'South West'),
    ('Ondo',        'ON', 'South West'),
    ('Osun',        'OS', 'South West'),
    ('Oyo',         'OY', 'South West'),
    ('Plateau',     'PL', 'North Central'),
    ('Rivers',      'RI', 'South South'),
    ('Sokoto',      'SO', 'North West'),
    ('Taraba',      'TA', 'North East'),
    ('Yobe',        'YO', 'North East'),
    ('Zamfara',     'ZA', 'North West')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- 2. ORGANISATIONS
-- ============================================================

-- ----- Regulatory Bodies -----
INSERT INTO public.organisations (name, short_name, org_type, status, state_id, website, notes) VALUES
(
    'Nigerian Electricity Regulatory Commission', 'NERC', 'NERC', 'ACTIVE',
    (SELECT id FROM states WHERE name = 'FCT'),
    'https://nerc.gov.ng',
    'Independent regulatory authority for the electricity industry'
),
(
    'Nigerian Electricity Management Services Agency', 'NEMSA', 'NEMSA', 'ACTIVE',
    (SELECT id FROM states WHERE name = 'FCT'),
    'https://nemsa.gov.ng',
    'Technical standards and safety enforcement agency'
);

-- ----- Market Entities -----
INSERT INTO public.organisations (name, short_name, org_type, status, state_id, website, notes) VALUES
(
    'Transmission Company of Nigeria', 'TCN', 'TCN', 'ACTIVE',
    (SELECT id FROM states WHERE name = 'FCT'),
    'https://tcn.org.ng',
    'Owns and operates the national transmission grid. Government-owned.'
),
(
    'Nigerian Bulk Electricity Trading Plc', 'NBET', 'NBET', 'ACTIVE',
    (SELECT id FROM states WHERE name = 'FCT'),
    'https://nfrfrbet.com.ng',
    'Bulk purchaser of electricity from generating companies'
);

-- ----- GENCOs (Privatised Generation Companies) -----
INSERT INTO public.organisations (name, short_name, org_type, status, state_id, date_licensed, notes) VALUES
(
    'Egbin Power Plc', 'EGBIN', 'GENCO', 'ACTIVE',
    (SELECT id FROM states WHERE name = 'Lagos'),
    '2013-11-01',
    'Largest thermal power station in sub-Saharan Africa. Acquired by Sahara Group.'
),
(
    'Transcorp Power Ltd', 'TRANSCORP', 'GENCO', 'ACTIVE',
    (SELECT id FROM states WHERE name = 'Delta'),
    '2013-11-01',
    'Operates the Ughelli Power Plant. Acquired by Transnational Corporation of Nigeria.'
),
(
    'Sapele Power Plc', 'SAPELE', 'GENCO', 'ACTIVE',
    (SELECT id FROM states WHERE name = 'Delta'),
    '2013-11-01',
    'Thermal generation plant in Sapele, Delta State.'
),
(
    'Afam Power Plc', 'AFAM', 'GENCO', 'ACTIVE',
    (SELECT id FROM states WHERE name = 'Rivers'),
    '2013-11-01',
    'Operates Afam IV and V power stations.'
),
(
    'Geregu Power Plc', 'GEREGU', 'GENCO', 'ACTIVE',
    (SELECT id FROM states WHERE name = 'Kogi'),
    '2013-11-01',
    'Gas-fired generation plant. Acquired by Amperion Power.'
),
(
    'Mainstream Energy Solutions Ltd', 'MAINSTREAM', 'GENCO', 'ACTIVE',
    (SELECT id FROM states WHERE name = 'Niger'),
    '2013-11-01',
    'Operates Kainji and Jebba hydroelectric power stations.'
),
(
    'North South Power Company Ltd', 'NSP', 'GENCO', 'ACTIVE',
    (SELECT id FROM states WHERE name = 'Niger'),
    '2013-11-01',
    'Operates Shiroro Hydroelectric Power Station.'
);

-- ----- DISCOs (11 Distribution Companies) -----
INSERT INTO public.organisations (name, short_name, org_type, status, state_id, date_licensed, notes) VALUES
(
    'Abuja Electricity Distribution Company', 'AEDC', 'DISCO', 'ACTIVE',
    (SELECT id FROM states WHERE name = 'FCT'),
    '2013-11-01',
    'Covers FCT, Niger, Kogi, Nasarawa'
),
(
    'Benin Electricity Distribution Company', 'BEDC', 'DISCO', 'ACTIVE',
    (SELECT id FROM states WHERE name = 'Edo'),
    '2013-11-01',
    'Covers Edo, Delta, Ondo, Ekiti'
),
(
    'Eko Electricity Distribution Company', 'EKEDC', 'DISCO', 'ACTIVE',
    (SELECT id FROM states WHERE name = 'Lagos'),
    '2013-11-01',
    'Covers Lagos Island, Lekki, Ajah, Ibeju-Lekki and parts of Ogun'
),
(
    'Enugu Electricity Distribution Company', 'EEDC', 'DISCO', 'ACTIVE',
    (SELECT id FROM states WHERE name = 'Enugu'),
    '2013-11-01',
    'Covers Enugu, Abia, Imo, Anambra, Ebonyi'
),
(
    'Ibadan Electricity Distribution Company', 'IBEDC', 'DISCO', 'ACTIVE',
    (SELECT id FROM states WHERE name = 'Oyo'),
    '2013-11-01',
    'Covers Oyo, Ogun, Osun, Kwara'
),
(
    'Ikeja Electric', 'IE', 'DISCO', 'ACTIVE',
    (SELECT id FROM states WHERE name = 'Lagos'),
    '2013-11-01',
    'Covers Ikeja, Ikorodu, Agege and surrounds in Lagos'
),
(
    'Jos Electricity Distribution Company', 'JED', 'DISCO', 'ACTIVE',
    (SELECT id FROM states WHERE name = 'Plateau'),
    '2013-11-01',
    'Covers Plateau, Bauchi, Benue, Gombe'
),
(
    'Kaduna Electricity Distribution Company', 'KAEDCO', 'DISCO', 'ACTIVE',
    (SELECT id FROM states WHERE name = 'Kaduna'),
    '2013-11-01',
    'Covers Kaduna, Sokoto, Kebbi, Zamfara'
),
(
    'Kano Electricity Distribution Company', 'KEDCO', 'DISCO', 'ACTIVE',
    (SELECT id FROM states WHERE name = 'Kano'),
    '2013-11-01',
    'Covers Kano, Katsina, Jigawa'
),
(
    'Port Harcourt Electricity Distribution Company', 'PHED', 'DISCO', 'ACTIVE',
    (SELECT id FROM states WHERE name = 'Rivers'),
    '2013-11-01',
    'Covers Rivers, Cross River, Bayelsa, Akwa Ibom'
),
(
    'Yola Electricity Distribution Company', 'YEDC', 'DISCO', 'ACTIVE',
    (SELECT id FROM states WHERE name = 'Adamawa'),
    '2013-11-01',
    'Covers Adamawa, Borno, Taraba, Yobe'
);

-- ----- IPPs (Independent Power Producers) -----
INSERT INTO public.organisations (name, short_name, org_type, status, state_id, notes) VALUES
(
    'Azura Power West Africa', 'AZURA', 'IPP', 'ACTIVE',
    (SELECT id FROM states WHERE name = 'Edo'),
    'Azura-Edo Open Cycle Gas Turbine plant. 461 MW capacity.'
),
(
    'Niger Delta Power Holding Company', 'NDPHC', 'IPP', 'ACTIVE',
    (SELECT id FROM states WHERE name = 'FCT'),
    'Government-owned. Operates NIPP plants: Alaoji, Calabar, Gbarain, Ihovbor, Olorunsogo II, Omotosho II, Geregu II.'
),
(
    'Agip Energy and Natural Resources', 'NAOC', 'IPP', 'ACTIVE',
    (SELECT id FROM states WHERE name = 'Delta'),
    'Operates Okpai Power Plant (480 MW).'
),
(
    'Shell Petroleum Development Company', 'SPDC', 'IPP', 'ACTIVE',
    (SELECT id FROM states WHERE name = 'Rivers'),
    'Operates Afam VI Power Plant (650 MW).'
);

-- ----- Gas Suppliers -----
INSERT INTO public.organisations (name, short_name, org_type, status, state_id, notes) VALUES
(
    'Nigerian National Petroleum Corporation', 'NNPC', 'OTHER', 'ACTIVE',
    (SELECT id FROM states WHERE name = 'FCT'),
    'National oil company. Parent of NGC (Nigerian Gas Company).'
),
(
    'Nigerian Gas Company', 'NGC', 'OTHER', 'ACTIVE',
    (SELECT id FROM states WHERE name = 'FCT'),
    'NNPC subsidiary. Primary gas supplier to thermal power plants.'
);

-- ============================================================
-- 3. POWER PLANTS
-- ============================================================

-- ----- Hydroelectric Plants -----
INSERT INTO public.power_plants (name, short_name, owner_id, state_id, plant_type, fuel_source, installed_capacity_mw, status, notes) VALUES
(
    'Kainji Hydroelectric Power Station', 'KAINJI',
    (SELECT id FROM organisations WHERE short_name = 'MAINSTREAM'),
    (SELECT id FROM states WHERE name = 'Niger'),
    'HYDRO', 'WATER', 760,
    'OPERATIONAL',
    'Commissioned 1968. Located on River Niger. Oldest large hydro plant in Nigeria.'
),
(
    'Jebba Hydroelectric Power Station', 'JEBBA',
    (SELECT id FROM organisations WHERE short_name = 'MAINSTREAM'),
    (SELECT id FROM states WHERE name = 'Kwara'),
    'HYDRO', 'WATER', 578,
    'OPERATIONAL',
    'Commissioned 1984. Located downstream from Kainji on River Niger.'
),
(
    'Shiroro Hydroelectric Power Station', 'SHIRORO',
    (SELECT id FROM organisations WHERE short_name = 'NSP'),
    (SELECT id FROM states WHERE name = 'Niger'),
    'HYDRO', 'WATER', 600,
    'OPERATIONAL',
    'Commissioned 1990. Located on Kaduna River.'
);

-- ----- Thermal Plants (GENCOs) -----
INSERT INTO public.power_plants (name, short_name, owner_id, gas_supplier_id, state_id, plant_type, fuel_source, installed_capacity_mw, status, notes) VALUES
(
    'Egbin Thermal Power Station', 'EGBIN',
    (SELECT id FROM organisations WHERE short_name = 'EGBIN'),
    (SELECT id FROM organisations WHERE short_name = 'NGC'),
    (SELECT id FROM states WHERE name = 'Lagos'),
    'THERMAL', 'GAS', 1320,
    'OPERATIONAL',
    'Largest thermal power station in sub-Saharan Africa. 6 x 220 MW steam turbines.'
),
(
    'Ughelli Power Plant', 'UGHELLI',
    (SELECT id FROM organisations WHERE short_name = 'TRANSCORP'),
    (SELECT id FROM organisations WHERE short_name = 'NGC'),
    (SELECT id FROM states WHERE name = 'Delta'),
    'THERMAL', 'GAS', 972,
    'OPERATIONAL',
    'Gas-fired combined cycle. Operated by Transcorp Power.'
),
(
    'Sapele Power Station', 'SAPELE',
    (SELECT id FROM organisations WHERE short_name = 'SAPELE'),
    (SELECT id FROM organisations WHERE short_name = 'NGC'),
    (SELECT id FROM states WHERE name = 'Delta'),
    'THERMAL', 'GAS', 1020,
    'OPERATIONAL',
    'Combined gas and steam turbines.'
),
(
    'Afam IV-V Power Station', 'AFAM45',
    (SELECT id FROM organisations WHERE short_name = 'AFAM'),
    (SELECT id FROM organisations WHERE short_name = 'NGC'),
    (SELECT id FROM states WHERE name = 'Rivers'),
    'THERMAL', 'GAS', 776,
    'OPERATIONAL',
    'Gas turbine plant in Afam, Rivers State.'
),
(
    'Geregu Power Station', 'GEREGU1',
    (SELECT id FROM organisations WHERE short_name = 'GEREGU'),
    (SELECT id FROM organisations WHERE short_name = 'NGC'),
    (SELECT id FROM states WHERE name = 'Kogi'),
    'THERMAL', 'GAS', 434,
    'OPERATIONAL',
    'Three GE Frame 9E gas turbines.'
);

-- ----- IPP Plants -----
INSERT INTO public.power_plants (name, short_name, owner_id, gas_supplier_id, state_id, plant_type, fuel_source, installed_capacity_mw, status, notes) VALUES
(
    'Azura-Edo IPP', 'AZURA',
    (SELECT id FROM organisations WHERE short_name = 'AZURA'),
    (SELECT id FROM organisations WHERE short_name = 'NGC'),
    (SELECT id FROM states WHERE name = 'Edo'),
    'THERMAL', 'GAS', 461,
    'OPERATIONAL',
    'Open cycle gas turbine. First fully privately-financed IPP in Nigeria.'
),
(
    'Afam VI Power Plant', 'AFAM6',
    (SELECT id FROM organisations WHERE short_name = 'SPDC'),
    (SELECT id FROM organisations WHERE short_name = 'NGC'),
    (SELECT id FROM states WHERE name = 'Rivers'),
    'THERMAL', 'GAS', 650,
    'OPERATIONAL',
    'Operated by Shell/SPDC joint venture.'
),
(
    'Okpai Power Plant', 'OKPAI',
    (SELECT id FROM organisations WHERE short_name = 'NAOC'),
    (SELECT id FROM organisations WHERE short_name = 'NGC'),
    (SELECT id FROM states WHERE name = 'Delta'),
    'THERMAL', 'GAS', 480,
    'OPERATIONAL',
    'Operated by Agip/NAOC. Combined cycle.'
);

-- ----- NIPP Plants (NDPHC-owned) -----
INSERT INTO public.power_plants (name, short_name, owner_id, gas_supplier_id, state_id, plant_type, fuel_source, installed_capacity_mw, status, notes) VALUES
(
    'Alaoji NIPP', 'ALAOJI',
    (SELECT id FROM organisations WHERE short_name = 'NDPHC'),
    (SELECT id FROM organisations WHERE short_name = 'NGC'),
    (SELECT id FROM states WHERE name = 'Abia'),
    'THERMAL', 'GAS', 504,
    'OPERATIONAL',
    'National Integrated Power Project. Gas-fired combined cycle.'
),
(
    'Calabar NIPP', 'CALABAR',
    (SELECT id FROM organisations WHERE short_name = 'NDPHC'),
    (SELECT id FROM organisations WHERE short_name = 'NGC'),
    (SELECT id FROM states WHERE name = 'Cross River'),
    'THERMAL', 'GAS', 561,
    'OPERATIONAL',
    'National Integrated Power Project. Open cycle gas turbine.'
),
(
    'Gbarain NIPP', 'GBARAIN',
    (SELECT id FROM organisations WHERE short_name = 'NDPHC'),
    (SELECT id FROM organisations WHERE short_name = 'NGC'),
    (SELECT id FROM states WHERE name = 'Bayelsa'),
    'THERMAL', 'GAS', 225,
    'OPERATIONAL',
    'National Integrated Power Project.'
),
(
    'Ihovbor NIPP', 'IHOVBOR',
    (SELECT id FROM organisations WHERE short_name = 'NDPHC'),
    (SELECT id FROM organisations WHERE short_name = 'NGC'),
    (SELECT id FROM states WHERE name = 'Edo'),
    'THERMAL', 'GAS', 451,
    'OPERATIONAL',
    'National Integrated Power Project. Located in Benin City.'
),
(
    'Olorunsogo II NIPP', 'OLRG2',
    (SELECT id FROM organisations WHERE short_name = 'NDPHC'),
    (SELECT id FROM organisations WHERE short_name = 'NGC'),
    (SELECT id FROM states WHERE name = 'Ogun'),
    'THERMAL', 'GAS', 675,
    'OPERATIONAL',
    'National Integrated Power Project.'
),
(
    'Omotosho II NIPP', 'OMOT2',
    (SELECT id FROM organisations WHERE short_name = 'NDPHC'),
    (SELECT id FROM organisations WHERE short_name = 'NGC'),
    (SELECT id FROM states WHERE name = 'Ondo'),
    'THERMAL', 'GAS', 500,
    'OPERATIONAL',
    'National Integrated Power Project.'
),
(
    'Geregu II NIPP', 'GEREGU2',
    (SELECT id FROM organisations WHERE short_name = 'NDPHC'),
    (SELECT id FROM organisations WHERE short_name = 'NGC'),
    (SELECT id FROM states WHERE name = 'Kogi'),
    'THERMAL', 'GAS', 434,
    'OPERATIONAL',
    'National Integrated Power Project.'
);

-- ============================================================
-- VERIFICATION QUERIES (run these to confirm)
-- ============================================================

-- Count states
-- SELECT COUNT(*) AS total_states FROM states;
-- Expected: 37

-- Count organisations by type
-- SELECT org_type, COUNT(*) FROM organisations GROUP BY org_type ORDER BY org_type;
-- Expected: DISCO=11, GENCO=7, IPP=4, NBET=1, NEMSA=1, NERC=1, OTHER=2, TCN=1

-- Count power plants by type
-- SELECT plant_type, COUNT(*), SUM(installed_capacity_mw) AS total_mw
-- FROM power_plants GROUP BY plant_type;

-- List all plants with owners
-- SELECT pp.name, pp.installed_capacity_mw, o.short_name AS owner, pp.plant_type
-- FROM power_plants pp
-- JOIN organisations o ON pp.owner_id = o.id
-- ORDER BY pp.installed_capacity_mw DESC;
