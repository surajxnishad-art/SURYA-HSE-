import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

export const ROOT_DIR = process.cwd();
export const DB_DIR = path.resolve(ROOT_DIR, 'database');
export const UPLOADS_DIR = path.resolve(ROOT_DIR, 'uploads');
export const GENERATED_DIR = path.resolve(ROOT_DIR, 'generated');
export const DB_PATH = path.resolve(DB_DIR, 'suraj_hse.db');

for (const dir of [DB_DIR, UPLOADS_DIR, GENERATED_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('Admin', 'Safety Officer', 'Supervisor', 'Viewer')),
      department TEXT NOT NULL DEFAULT 'HSE',
      designation TEXT NOT NULL DEFAULT 'Safety Engineer',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      obs_code TEXT NOT NULL UNIQUE,
      observed_at TEXT NOT NULL,
      location TEXT NOT NULL,
      agency_name TEXT NOT NULL,
      job_executor TEXT NOT NULL,
      work_activity TEXT NOT NULL,
      category TEXT NOT NULL,
      observation_type TEXT NOT NULL,
      title TEXT NOT NULL,
      photo_summary TEXT NOT NULL DEFAULT '',
      details TEXT NOT NULL,
      details_hi TEXT NOT NULL DEFAULT '',
      hazard TEXT NOT NULL,
      potential_consequence TEXT NOT NULL,
      risk_level TEXT NOT NULL CHECK(risk_level IN ('Low', 'Medium', 'High', 'Critical', 'Needs Verification')),
      corrective_action TEXT NOT NULL,
      preventive_action TEXT NOT NULL DEFAULT '',
      precaution TEXT NOT NULL DEFAULT '',
      responsible_person TEXT NOT NULL,
      site_verification TEXT NOT NULL DEFAULT '',
      target_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('Open', 'Closed', 'Overdue')),
      photo_path TEXT NOT NULL DEFAULT '',
      additional_photos_json TEXT NOT NULL DEFAULT '[]',
      closure_remarks TEXT NOT NULL DEFAULT '',
      closing_date TEXT NOT NULL DEFAULT '',
      site_incharge_name TEXT NOT NULL DEFAULT '',
      site_incharge_signature TEXT NOT NULL DEFAULT '',
      site_supervisor_name TEXT NOT NULL DEFAULT '',
      site_supervisor_signature TEXT NOT NULL DEFAULT '',
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inspections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      insp_code TEXT NOT NULL UNIQUE,
      module_type TEXT NOT NULL,
      equipment_id TEXT NOT NULL,
      location TEXT NOT NULL,
      inspector_name TEXT NOT NULL,
      inspection_date TEXT NOT NULL,
      checklist_json TEXT NOT NULL,
      overall_status TEXT NOT NULL CHECK(overall_status IN ('Pass', 'Action Required', 'Fail')),
      risk_level TEXT NOT NULL CHECK(risk_level IN ('Low', 'Medium', 'High', 'Critical')),
      remarks TEXT NOT NULL DEFAULT '',
      photo_path TEXT NOT NULL DEFAULT '',
      corrective_action TEXT NOT NULL DEFAULT '',
      responsible_person TEXT NOT NULL DEFAULT '',
      target_date TEXT NOT NULL DEFAULT '',
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS safety_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doc_code TEXT NOT NULL UNIQUE,
      doc_type TEXT NOT NULL,
      title TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'Bilingual',
      location TEXT NOT NULL,
      department TEXT NOT NULL,
      prepared_by TEXT NOT NULL,
      content_json TEXT NOT NULL,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inc_code TEXT NOT NULL UNIQUE,
      incident_date TEXT NOT NULL,
      location TEXT NOT NULL,
      agency_name TEXT NOT NULL,
      incident_type TEXT NOT NULL,
      severity TEXT NOT NULL,
      description TEXT NOT NULL,
      root_cause TEXT NOT NULL,
      corrective_action TEXT NOT NULL,
      responsible_person TEXT NOT NULL,
      target_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('Open', 'Closed', 'Under Investigation')),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trainings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trn_code TEXT NOT NULL UNIQUE,
      training_date TEXT NOT NULL,
      topic TEXT NOT NULL,
      trainer_name TEXT NOT NULL,
      location TEXT NOT NULL,
      department TEXT NOT NULL,
      attendees_count INTEGER NOT NULL DEFAULT 0,
      duration_hours REAL NOT NULL DEFAULT 1.0,
      status TEXT NOT NULL DEFAULT 'Completed',
      remarks TEXT NOT NULL DEFAULT '',
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      aud_code TEXT NOT NULL UNIQUE,
      audit_date TEXT NOT NULL,
      audit_type TEXT NOT NULL,
      location TEXT NOT NULL,
      lead_auditor TEXT NOT NULL,
      score_percent REAL NOT NULL DEFAULT 0,
      findings_count INTEGER NOT NULL DEFAULT 0,
      open_nc_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Open',
      summary TEXT NOT NULL DEFAULT '',
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS generated_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prompt TEXT NOT NULL,
      category TEXT NOT NULL,
      aspect_ratio TEXT NOT NULL,
      image_path TEXT NOT NULL,
      model_used TEXT NOT NULL,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      user_email TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL DEFAULT '',
      details TEXT NOT NULL DEFAULT '',
      ip_address TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_obs_status ON observations(status);
    CREATE INDEX IF NOT EXISTS idx_obs_risk ON observations(risk_level);
    CREATE INDEX IF NOT EXISTS idx_obs_date ON observations(observed_at);
    CREATE INDEX IF NOT EXISTS idx_insp_module ON inspections(module_type);
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
  `);

  const hasMigration = db.prepare('SELECT 1 FROM schema_migrations WHERE version = 1').get();
  if (!hasMigration) {
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?)').run(new Date().toISOString());
  }

  seedInitialDomainData();
}

function seedInitialDomainData(): void {
  const obsCount = (db.prepare('SELECT COUNT(*) as c FROM observations').get() as { c: number }).c;
  if (obsCount > 0) return;

  const now = new Date().toISOString();

  const insertObs = db.prepare(`
    INSERT INTO observations (
      obs_code, observed_at, location, agency_name, job_executor, work_activity,
      category, observation_type, title, photo_summary, details, details_hi,
      hazard, potential_consequence, risk_level, corrective_action, preventive_action,
      precaution, responsible_person, site_verification, target_date, status,
      photo_path, additional_photos_json, closure_remarks, closing_date,
      site_incharge_name, site_incharge_signature, site_supervisor_name, site_supervisor_signature,
      created_at, updated_at
    ) VALUES (
      @obs_code, @observed_at, @location, @agency_name, @job_executor, @work_activity,
      @category, @observation_type, @title, @photo_summary, @details, @details_hi,
      @hazard, @potential_consequence, @risk_level, @corrective_action, @preventive_action,
      @precaution, @responsible_person, @site_verification, @target_date, @status,
      @photo_path, '[]', @closure_remarks, @closing_date,
      @site_incharge_name, @site_incharge_signature, @site_supervisor_name, @site_supervisor_signature,
      @created_at, @updated_at
    )
  `);

  const sampleObservations = [
    {
      obs_code: 'OBS-2026-0001',
      observed_at: '2026-11-18T09:30:00',
      location: 'Steel Melt Shop - Bay 3',
      agency_name: 'Kalyani Infra & Erectors Pvt Ltd',
      job_executor: 'Ramesh Verma',
      work_activity: 'Overhead Crane Maintenance & Structural Inspection',
      category: 'Work at Height',
      observation_type: 'Unsafe Condition',
      title: 'Missing mid-rail on elevated scaffold access platform at +12m level',
      photo_summary: 'Elevated structural platform photographed showing perimeter guardrails and harness usage on site.',
      details: 'During routine walkdown at Steel Melt Shop Bay 3, one section of the temporary access scaffold at +12m elevation was found with a loose mid-rail coupler and incomplete toe-board.',
      details_hi: 'स्टील मेल्ट शॉप बे-3 में +12 मीटर ऊंचाई पर मचान प्लेटफॉर्म के एक हिस्से में मिड-रेल कप्लर ढीला और टो-बोर्ड अधूरा पाया गया।',
      hazard: 'Unsecured edge protection at +12m working height',
      potential_consequence: 'Fall of worker or hand tools from height causing severe injury or fatality',
      risk_level: 'Critical',
      corrective_action: 'Stop work on Bay 3 scaffold immediately, install rigid mid-rail & 150mm toe-board, and re-tag Green by Scaffold Inspector.',
      preventive_action: 'Enforce daily pre-shift scaffold tag verification before issuing Work at Height PTW.',
      precaution: '100% double-lanyard full-body harness tie-off anchored above shoulder level.',
      responsible_person: 'Vikram Singh (Site Engineer)',
      site_verification: 'Verify Green Scaffold Tag signature and torque check on all right-angle couplers.',
      target_date: '2026-11-20',
      status: 'Overdue',
      photo_path: '/src/assets/images/construction_work_height_1795470579505.jpg',
      closure_remarks: '',
      closing_date: '',
      site_incharge_name: 'A. K. Deshmukh',
      site_incharge_signature: 'A. K. Deshmukh',
      site_supervisor_name: 'Ramesh Verma',
      site_supervisor_signature: 'R. Verma',
      created_at: now,
      updated_at: now,
    },
    {
      obs_code: 'OBS-2026-0002',
      observed_at: '2026-11-19T14:15:00',
      location: '11kV Main Switchgear Substation - Block B',
      agency_name: 'VoltTech Power Systems',
      job_executor: 'Suresh Nair',
      work_activity: 'Breaker Panel Preventive Maintenance',
      category: 'Electrical Safety',
      observation_type: 'Positive Observation',
      title: 'Compliant Arc-Flash PPE and LOTO isolation verified during switchgear inspection',
      photo_summary: 'Technician wearing full arc-flash visor, insulated gloves, and hard hat inspecting labeled 11kV switchgear panel with CO2 extinguisher nearby.',
      details: 'Technician adhered strictly to LOTO procedures, wore Class-00 insulated gloves and arc-flash hood, and maintained clear access to CO2 fire extinguisher.',
      details_hi: 'इलेक्ट्रिकल तकनीशियन ने 11kV स्विचगियर जांच के दौरान आर्क-फ्लैश वाइज़र, इंसुलेटेड दस्ताने और LOTO प्रक्रिया का पूर्ण पालन किया।',
      hazard: 'High-voltage arc flash and electrocution exposure (controlled)',
      potential_consequence: 'Severe electrical burns if PPE/LOTO standards lapse',
      risk_level: 'Low',
      corrective_action: 'Recognize technician during weekly Toolbox Talk as PPE compliance benchmark.',
      preventive_action: 'Continue monthly calibration check of insulated gloves and voltage detectors.',
      precaution: 'Maintain 1.5m arc-flash boundary barricade and verify zero-energy test before touch.',
      responsible_person: 'Suresh Nair (Electrical Lead)',
      site_verification: 'LOTO logbook and PTW serial verified.',
      target_date: '2026-11-22',
      status: 'Closed',
      photo_path: '/src/assets/images/power_electrical_safety_1795470580783.jpg',
      closure_remarks: 'Verified compliant during audit walkdown. Commendation logged.',
      closing_date: '2026-11-19',
      site_incharge_name: 'M. P. Tiwari',
      site_incharge_signature: 'M. P. Tiwari',
      site_supervisor_name: 'Suresh Nair',
      site_supervisor_signature: 'S. Nair',
      created_at: now,
      updated_at: now,
    },
    {
      obs_code: 'OBS-2026-0003',
      observed_at: '2026-11-20T11:00:00',
      location: 'Central Logistics Warehouse - Aisle 14',
      agency_name: 'In-House Logistics Team',
      job_executor: 'Deepak Sharma',
      work_activity: 'Forklift Material Stacking & Hydrant Inspection',
      category: 'Traffic & Forklift Safety',
      observation_type: 'Unsafe Condition',
      title: 'Pallet staging encroaching 30cm into yellow pedestrian walkway near Aisle 14',
      photo_summary: 'Warehouse aisle with high-visibility pedestrian lanes, forklift with amber beacon, and wall-mounted fire extinguisher station.',
      details: 'Shrink-wrapped pallet temporarily staged near Aisle 14 fire hose reel reduced pedestrian clearance width. Fire extinguisher pressure gauge in green zone.',
      details_hi: 'सेंट्रल वेयरहाउस आइल-14 के पास पैदल मार्ग और फायर होज़ रील के निकट पैलेट रखा होने से रास्ता आंशिक रूप से बाधित हुआ।',
      hazard: 'Pedestrian-forklift collision risk and partial obstruction to fire point',
      potential_consequence: 'Struck-by forklift injury or delayed emergency fire response',
      risk_level: 'High',
      corrective_action: 'Relocate pallet to designated bay 108 immediately and keep 1.2m clearance around fire point.',
      preventive_action: 'Paint hatched "NO STORAGE - FIRE POINT" floor box and brief forklift operators.',
      precaution: 'Sound horn at all blind aisle intersections and maintain 5 km/h indoor speed limit.',
      responsible_person: 'Deepak Sharma (Warehouse Supervisor)',
      site_verification: 'Supervisor to confirm walkway completely clear in afternoon round.',
      target_date: '2026-11-25',
      status: 'Open',
      photo_path: '/src/assets/images/warehouse_logistics_safety_1795470580246.jpg',
      closure_remarks: '',
      closing_date: '',
      site_incharge_name: 'R. K. Malhotra',
      site_incharge_signature: 'R. K. Malhotra',
      site_supervisor_name: 'Deepak Sharma',
      site_supervisor_signature: 'D. Sharma',
      created_at: now,
      updated_at: now,
    },
    {
      obs_code: 'OBS-2026-0004',
      observed_at: '2026-11-15T10:15:00',
      location: 'Rolling Mill Floor - DEMAG 50T Crane Bay',
      agency_name: 'Bharat Heavy Fabrication',
      job_executor: 'Manoj Yadav',
      work_activity: '50T Overhead Crane Coil Shifting',
      category: 'Lifting & Crane Safety',
      observation_type: 'Unsafe Act',
      title: 'Tagline length insufficient during 50T EOT crane load lowering',
      photo_summary: 'Heavy industrial rolling mill bay with yellow pedestrian lane and 50T overhead gantry crane in operation.',
      details: 'Rigger stood within 1.5m of suspended load during initial lift alignment due to short tagline.',
      details_hi: '50 टन क्रेन से लोड उतारते समय छोटी टैगलाइन के कारण रिगर लोड के बहुत करीब खड़ा पाया गया।',
      hazard: 'Proximity to suspended load / pinch & crush zone',
      potential_consequence: 'Fatal crush injury if load swings or sling fails',
      risk_level: 'High',
      corrective_action: 'Replaced tagline with 5m non-conductive polypropylene rope and re-positioned rigger outside exclusion zone.',
      preventive_action: 'Include tagline length check in daily lifting tackle pre-use inspection.',
      precaution: 'Never stand under suspended load; barricade swing radius with red-white cones.',
      responsible_person: 'Manoj Yadav (Rigging Lead)',
      site_verification: '5m taglines verified on all Bay-1 lifting sets.',
      target_date: '2026-11-16',
      status: 'Closed',
      photo_path: '/src/assets/images/steel_plant_operations_1795470578922.jpg',
      closure_remarks: '5m taglines issued and crew re-briefed on crane exclusion zone.',
      closing_date: '2026-11-16',
      site_incharge_name: 'A. K. Deshmukh',
      site_incharge_signature: 'A. K. Deshmukh',
      site_supervisor_name: 'Manoj Yadav',
      site_supervisor_signature: 'M. Yadav',
      created_at: now,
      updated_at: now,
    },
    {
      obs_code: 'OBS-2026-0005',
      observed_at: '2026-10-12T16:20:00',
      location: 'Hot Strip Mill - Gas Cutting Zone',
      agency_name: 'Shree Ganesh Contractors',
      job_executor: 'Harish Patel',
      work_activity: 'Oxy-Acetylene Gas Cutting',
      category: 'Hot Work & Fire Safety',
      observation_type: 'Unsafe Condition',
      title: 'Flashback arrestor missing at cylinder regulator end',
      photo_summary: '',
      details: 'Oxy-acetylene cutting set had flashback arrestor at torch end only; cylinder regulator end arrestor was missing.',
      details_hi: 'गैस कटिंग सेट के सिलेंडर रेगुलेटर सिरे पर फ्लैशबैक अरेस्टर नहीं लगा था।',
      hazard: 'Backfire / flashback flame propagation into gas cylinder',
      potential_consequence: 'Cylinder explosion causing catastrophic blast and fire',
      risk_level: 'Critical',
      corrective_action: 'Hot work halted; dual-end EN-730 flashback arrestors installed and leak-tested with soap solution.',
      preventive_action: 'Daily Hot Work permit sign-off must physically inspect both regulator and torch arrestors.',
      precaution: 'Keep 9kg ABC fire extinguisher and fire blanket within 3m of hot work.',
      responsible_person: 'Harish Patel',
      site_verification: 'Checked and approved by Fire Safety Officer.',
      target_date: '2026-10-12',
      status: 'Closed',
      photo_path: '',
      closure_remarks: 'Dual flashback arrestors fitted and Hot Work PTW re-issued.',
      closing_date: '2026-10-12',
      site_incharge_name: 'M. P. Tiwari',
      site_incharge_signature: 'M. P. Tiwari',
      site_supervisor_name: 'Harish Patel',
      site_supervisor_signature: 'H. Patel',
      created_at: now,
      updated_at: now,
    },
    {
      obs_code: 'OBS-2026-0006',
      observed_at: '2026-09-21T08:45:00',
      location: 'Utility Plant - Cooling Tower Trench',
      agency_name: 'InfraBuild Civil Works',
      job_executor: 'Prakash Joshi',
      work_activity: 'Pipe Trench Excavation (2.2m depth)',
      category: 'Excavation & Civil',
      observation_type: 'Unsafe Condition',
      title: 'Excavated soil dumped within 0.5m of trench edge',
      photo_summary: '',
      details: 'Spoil heap accumulated too close to unshored 2.2m pipe trench, increasing surcharge load on trench wall.',
      details_hi: 'खुदाई की मिट्टी गड्ढे के किनारे से 0.5 मीटर के भीतर जमा थी, जिससे मिट्टी धंसने का खतरा था।',
      hazard: 'Trench wall collapse / cave-in',
      potential_consequence: 'Worker entrapment / suffocation inside trench',
      risk_level: 'High',
      corrective_action: 'Moved spoil pile at least 1.5m back from trench edge and installed timber shoring & access ladder.',
      preventive_action: 'Mandate daily soil stability sign-off by Civil Safety Engineer.',
      precaution: 'Provide hard barricading 1m away from trench perimeter.',
      responsible_person: 'Prakash Joshi',
      site_verification: 'Verified 1.5m setback and access ladder extension.',
      target_date: '2026-09-22',
      status: 'Closed',
      photo_path: '',
      closure_remarks: 'Spoil shifted and shoring completed.',
      closing_date: '2026-09-22',
      site_incharge_name: 'A. K. Deshmukh',
      site_incharge_signature: 'A. K. Deshmukh',
      site_supervisor_name: 'Prakash Joshi',
      site_supervisor_signature: 'P. Joshi',
      created_at: now,
      updated_at: now,
    },
    {
      obs_code: 'OBS-2026-0007',
      observed_at: '2026-08-14T15:10:00',
      location: 'Boiler House - Level 2 Walkway',
      agency_name: 'Apex Industrial Services',
      job_executor: 'Sanjay Gupta',
      work_activity: 'Valve Servicing',
      category: 'Housekeeping',
      observation_type: 'Unsafe Condition',
      title: 'Oil spill residue near boiler feed pump walkway',
      photo_summary: '',
      details: 'Minor hydraulic oil drip created slippery patch on chequered plate walkway.',
      details_hi: 'बॉयलर फीड पंप के पास फर्श पर तेल रिसाव के कारण फिसलन की स्थिति पाई गई।',
      hazard: 'Slip, trip, and fall hazard',
      potential_consequence: 'Fracture or sprain injury from fall on steel grating',
      risk_level: 'Medium',
      corrective_action: 'Cleaned spill with absorbent pads, placed drip tray, and tightened flange.',
      preventive_action: 'Schedule weekly flange seal integrity inspection.',
      precaution: 'Place wet-floor warning cone until surface is completely degreased.',
      responsible_person: 'Sanjay Gupta',
      site_verification: 'Area inspected and found dry.',
      target_date: '2026-08-15',
      status: 'Closed',
      photo_path: '',
      closure_remarks: 'Cleaned and drip tray installed.',
      closing_date: '2026-08-14',
      site_incharge_name: 'R. K. Malhotra',
      site_incharge_signature: 'R. K. Malhotra',
      site_supervisor_name: 'Sanjay Gupta',
      site_supervisor_signature: 'S. Gupta',
      created_at: now,
      updated_at: now,
    },
    {
      obs_code: 'OBS-2026-0008',
      observed_at: '2026-11-22T10:05:00',
      location: 'City Bridge Corridor - Pier P14',
      agency_name: 'Metro Infra Contractors',
      job_executor: 'Anil Kumar',
      work_activity: 'Pier Cap Reinforcement & Concrete Pour',
      category: 'PPE Compliance',
      observation_type: 'Unsafe Act',
      title: 'Two helpers observed without chin straps fastened on safety helmets',
      photo_summary: '',
      details: 'During wind gust at Pier P14 deck, two workers had unfastened helmet chin straps.',
      details_hi: 'पियर P14 पर कार्य के दौरान दो श्रमिकों के सेफ्टी हेलमेट की चिन स्ट्रैप खुली पाई गई।',
      hazard: 'Helmet dislodgement during elevated work',
      potential_consequence: 'Head impact injury or dropped object hazard to workers below',
      risk_level: 'Medium',
      corrective_action: 'Immediate on-the-spot coaching; chin straps fastened and inspected.',
      preventive_action: 'Include PPE chin-strap check in daily morning TBT.',
      precaution: 'All personnel working above 2m must wear EN-397 helmets with 4-point chin straps.',
      responsible_person: 'Anil Kumar',
      site_verification: 'Re-checked during afternoon round.',
      target_date: '2026-11-26',
      status: 'Open',
      photo_path: '',
      closure_remarks: '',
      closing_date: '',
      site_incharge_name: 'A. K. Deshmukh',
      site_incharge_signature: 'A. K. Deshmukh',
      site_supervisor_name: 'Anil Kumar',
      site_supervisor_signature: 'A. Kumar',
      created_at: now,
      updated_at: now,
    }
  ];

  const tx = db.transaction(() => {
    for (const o of sampleObservations) {
      insertObs.run(o);
    }

    const insertInsp = db.prepare(`
      INSERT INTO inspections (
        insp_code, module_type, equipment_id, location, inspector_name, inspection_date,
        checklist_json, overall_status, risk_level, remarks, photo_path,
        corrective_action, responsible_person, target_date, created_at, updated_at
      ) VALUES (
        @insp_code, @module_type, @equipment_id, @location, @inspector_name, @inspection_date,
        @checklist_json, @overall_status, @risk_level, @remarks, @photo_path,
        @corrective_action, @responsible_person, @target_date, @created_at, @updated_at
      )
    `);

    const sampleInspections = [
      {
        insp_code: 'INSP-2026-0001',
        module_type: 'Fire Extinguishers',
        equipment_id: 'FE-WH-014 (CO2 4.5kg)',
        location: 'Central Warehouse - Aisle 14',
        inspector_name: 'Suresh Nair',
        inspection_date: '2026-11-20',
        checklist_json: JSON.stringify([
          { item: 'Pressure gauge needle in green zone', status: 'Compliant', notes: '15 bar nominal' },
          { item: 'Safety pin and tamper seal intact', status: 'Compliant', notes: 'Seal #88412' },
          { item: 'Discharge horn & hose free from cracks', status: 'Compliant', notes: 'Good condition' },
          { item: 'Access unobstructed (1.2m clearance)', status: 'Non-Compliant', notes: 'Pallet edge slightly intruding; cleared on site' },
        ]),
        overall_status: 'Action Required',
        risk_level: 'Medium',
        remarks: 'Extinguisher unit healthy; floor clearance marked.',
        photo_path: '/src/assets/images/warehouse_logistics_safety_1795470580246.jpg',
        corrective_action: 'Repaint yellow clearance box around fire station #14',
        responsible_person: 'Deepak Sharma',
        target_date: '2026-11-25',
        created_at: now,
        updated_at: now,
      },
      {
        insp_code: 'INSP-2026-0002',
        module_type: 'Electrical Panels',
        equipment_id: 'SWGR-4B-101',
        location: '11kV Substation - Block B',
        inspector_name: 'M. P. Tiwari',
        inspection_date: '2026-11-19',
        checklist_json: JSON.stringify([
          { item: 'Arc-flash & high-voltage warning signage visible', status: 'Compliant', notes: 'Clear bilingual labels' },
          { item: 'Insulated rubber mat placed in front of panel', status: 'Compliant', notes: 'IS 15652 tested' },
          { item: 'Double earthing continuity verified', status: 'Compliant', notes: '0.4 Ohm measured' },
          { item: 'Panel door interlock & LOTO provision working', status: 'Compliant', notes: 'Tested OK' },
        ]),
        overall_status: 'Pass',
        risk_level: 'Low',
        remarks: 'All electrical safety controls verified.',
        photo_path: '/src/assets/images/power_electrical_safety_1795470580783.jpg',
        corrective_action: 'None required',
        responsible_person: 'Suresh Nair',
        target_date: '2026-11-19',
        created_at: now,
        updated_at: now,
      },
      {
        insp_code: 'INSP-2026-0003',
        module_type: 'Cranes',
        equipment_id: 'DEMAG-EOT-50T-01',
        location: 'Rolling Mill Floor - Bay 1',
        inspector_name: 'A. K. Deshmukh',
        inspection_date: '2026-11-18',
        checklist_json: JSON.stringify([
          { item: 'Upper & lower hoist limit switches functional', status: 'Compliant', notes: 'Tested before shift' },
          { item: 'Wire rope free from broken strands / kinks', status: 'Compliant', notes: 'Lubricated' },
          { item: 'Hook safety latch & SWL marking legible', status: 'Compliant', notes: '50T clearly stenciled' },
          { item: 'Audio-visual travel alarm & beacon operational', status: 'Compliant', notes: 'Loud & visible' },
        ]),
        overall_status: 'Pass',
        risk_level: 'Low',
        remarks: 'Third-party load test certificate valid till May 2027.',
        photo_path: '/src/assets/images/steel_plant_operations_1795470578922.jpg',
        corrective_action: 'None required',
        responsible_person: 'Manoj Yadav',
        target_date: '2026-11-18',
        created_at: now,
        updated_at: now,
      },
    ];
    for (const i of sampleInspections) insertInsp.run(i);

    db.prepare(`
      INSERT INTO safety_documents (doc_code, doc_type, title, language, location, department, prepared_by, content_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'DOC-2026-0001',
      'JSA / JHA',
      'JSA: 50T Overhead Crane Coil Shifting & Rigging Operations',
      'Bilingual',
      'Rolling Mill Floor - Bay 1',
      'Steel Operations & Rigging',
      'SURAJ HSE Safety Department',
      JSON.stringify({
        summary: 'Job Safety Analysis covering pre-lift inspection, sling rigging, load travel, and coil placement using the 50T DEMAG EOT crane.',
        summaryHi: '50 टन ओवरहेड क्रेन से कॉइल शिफ्टिंग और रिगिंग कार्य के लिए पूर्ण कार्य सुरक्षा विश्लेषण (JSA)।',
        ppeRequired: ['Hard Hat (EN 397)', 'Safety Shoes (S3)', 'Cut-Resistant Gloves', 'High-Vis Reflective Vest', 'Safety Glasses'],
        hazardsAndControls: [
          { step: '1. Pre-Lift Inspection', hazard: 'Defective wire sling or faulty limit switch', risk: 'High', control: 'Verify valid TPI tag, inspect hook latch, test hoist limit switch unloaded.', responsibility: 'Crane Operator & Rigger' },
          { step: '2. Rigging & Hitching', hazard: 'Pinch points and sudden load shift', risk: 'Critical', control: 'Use 5m polypropylene taglines; keep hands clear of sling bite.', responsibility: 'Certified Rigger' },
          { step: '3. Load Travel & Lowering', hazard: 'Suspended load over personnel', risk: 'Critical', control: 'Sound siren, clear pedestrian lane, maintain 3m exclusion zone.', responsibility: 'Signalman / Supervisor' }
        ],
        verificationChecklist: [
          'Valid crane operator authorization card verified',
          'SWL of slings >= 1.5x coil weight confirmed',
          'Pedestrian aisle barricaded during lift'
        ],
        emergencyNotes: 'In case of sling failure or injury, sound emergency siren, isolate crane main switch, and call Plant Medical Center Ext. 108.'
      }),
      now,
      now
    );

    db.prepare(`
      INSERT INTO incidents (inc_code, incident_date, location, agency_name, incident_type, severity, description, root_cause, corrective_action, responsible_person, target_date, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'INC-2026-0001',
      '2026-11-10',
      'Scrap Yard - Weighbridge Gate',
      'Metro Logistics',
      'Near Miss',
      'Medium',
      'Reversing flatbed truck touched safety bollard at weighbridge entry due to absence of banksman.',
      'Spotter/banksman was not positioned at rear blind spot during reversing.',
      'Mandated dedicated banksman with red/green flag and reflective vest for all heavy vehicle reversing.',
      'R. K. Malhotra',
      '2026-11-12',
      'Closed',
      now
    );

    db.prepare(`
      INSERT INTO trainings (trn_code, training_date, topic, trainer_name, location, department, attendees_count, duration_hours, status, remarks, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'TRN-2026-0001',
      '2026-11-17',
      'Work at Height Rescue & Full-Body Harness Inspection (ऊंचाई पर सुरक्षा प्रशिक्षण)',
      'A. K. Deshmukh',
      'HSE Training Center - Hall A',
      'Civil & Mechanical Maintenance',
      34,
      2.5,
      'Completed',
      'Practical harness suspension trauma drill conducted with 100% pass score.',
      now
    );

    db.prepare(`
      INSERT INTO audits (aud_code, audit_date, audit_type, location, lead_auditor, score_percent, findings_count, open_nc_count, status, summary, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'AUD-2026-0001',
      '2026-11-14',
      'ISO 45001 Internal HSE Audit',
      'Steel Melt Shop & Substation Block B',
      'M. P. Tiwari',
      91.5,
      6,
      1,
      'Open',
      'Strong electrical LOTO compliance; 1 open non-conformity on Bay 3 scaffold mid-rail tagging.',
      now
    );
  });

  tx();
}
