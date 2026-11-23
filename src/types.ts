export type UserRole = 'Admin' | 'Safety Officer' | 'Supervisor' | 'Viewer';

export interface UserProfile {
  id: number;
  full_name: string;
  email: string;
  role: UserRole;
  department: string;
  designation: string;
  is_active: number;
  created_at?: string;
}

export interface Observation {
  id: number;
  obs_code: string;
  observed_at: string;
  location: string;
  agency_name: string;
  job_executor: string;
  work_activity: string;
  category: string;
  observation_type: string;
  title: string;
  photo_summary: string;
  details: string;
  details_hi: string;
  hazard: string;
  potential_consequence: string;
  risk_level: 'Low' | 'Medium' | 'High' | 'Critical' | 'Needs Verification';
  corrective_action: string;
  preventive_action: string;
  precaution: string;
  responsible_person: string;
  site_verification: string;
  target_date: string;
  status: 'Open' | 'Closed' | 'Overdue';
  photo_path: string;
  additional_photos_json: string;
  closure_remarks: string;
  closing_date: string;
  site_incharge_name: string;
  site_incharge_signature: string;
  site_supervisor_name: string;
  site_supervisor_signature: string;
  created_at: string;
  updated_at: string;
}

export interface ChecklistItem {
  item: string;
  status: 'Compliant' | 'Non-Compliant' | 'Not Applicable';
  notes: string;
}

export interface Inspection {
  id: number;
  insp_code: string;
  module_type: string;
  equipment_id: string;
  location: string;
  inspector_name: string;
  inspection_date: string;
  checklist_json: string;
  overall_status: 'Pass' | 'Action Required' | 'Fail';
  risk_level: 'Low' | 'Medium' | 'High' | 'Critical';
  remarks: string;
  photo_path: string;
  corrective_action: string;
  responsible_person: string;
  target_date: string;
  created_at: string;
}

export interface SafetyDocContent {
  summary: string;
  summaryHi: string;
  ppeRequired: string[];
  hazardsAndControls: Array<{
    step: string;
    hazard: string;
    risk: string;
    control: string;
    responsibility: string;
  }>;
  verificationChecklist: string[];
  emergencyNotes: string;
}

export interface SafetyDocument {
  id: number;
  doc_code: string;
  doc_type: string;
  title: string;
  language: 'English' | 'Hindi' | 'Bilingual';
  location: string;
  department: string;
  prepared_by: string;
  content_json: string;
  created_at: string;
}

export interface IncidentRecord {
  id: number;
  inc_code: string;
  incident_date: string;
  location: string;
  agency_name: string;
  incident_type: string;
  severity: string;
  description: string;
  root_cause: string;
  corrective_action: string;
  responsible_person: string;
  target_date: string;
  status: string;
}

export interface TrainingRecord {
  id: number;
  trn_code: string;
  training_date: string;
  topic: string;
  trainer_name: string;
  location: string;
  department: string;
  attendees_count: number;
  duration_hours: number;
  status: string;
  remarks: string;
}

export interface AuditRecord {
  id: number;
  aud_code: string;
  audit_date: string;
  audit_type: string;
  location: string;
  lead_auditor: string;
  score_percent: number;
  findings_count: number;
  open_nc_count: number;
  status: string;
  summary: string;
}

export interface DashboardData {
  kpis: {
    totalObservations: number;
    openObservations: number;
    closedObservations: number;
    overdueObservations: number;
    highCriticalObservations: number;
    totalInspections: number;
    pendingCorrectiveActions: number;
    overdueActions: number;
    documentsGenerated: number;
    incidentsCount: number;
    trainingsCount: number;
    auditsCount: number;
  };
  charts: {
    monthlyObservations: Array<{ month: string; total: number; closed: number; highCritical: number }>;
    riskBreakdown: Array<{ name: string; value: number }>;
    statusBreakdown: Array<{ name: string; value: number }>;
    categoryBreakdown: Array<{ name: string; count: number }>;
  };
  recentActivities: Array<{
    id: number;
    user_email: string;
    action: string;
    entity_type: string;
    entity_id: string;
    details: string;
    created_at: string;
  }>;
  recentObservations: Array<{
    id: number;
    obs_code: string;
    title: string;
    location: string;
    risk_level: string;
    status: string;
    observed_at: string;
  }>;
}

export const SAFETY_CATEGORIES = [
  'Work at Height',
  'Electrical Safety',
  'PPE Compliance',
  'Lifting & Crane Safety',
  'Hot Work & Fire Safety',
  'Scaffolding',
  'Excavation & Civil',
  'Confined Space',
  'Traffic & Forklift Safety',
  'Housekeeping',
  'Machine Guarding',
  'Chemical & Gas Safety',
  'General Industrial Safety',
];

export const INSPECTION_MODULES: Array<{ name: string; items: string[] }> = [
  {
    name: 'Fire Extinguishers',
    items: [
      'Pressure gauge needle in green operating zone',
      'Safety pin and tamper-evident seal intact',
      'Discharge nozzle/hose free from blockage or cracks',
      'Inspection tag updated & hydro-test date valid',
      'Mounted cleanly with 1.2m unobstructed access',
    ],
  },
  {
    name: 'Electrical Panels',
    items: [
      'Danger / Arc-flash warning signage clearly displayed',
      'IS-15652 certified insulated rubber mat in front',
      'Double body & neutral earthing connections tight',
      'ELCB / RCCB (30mA) trip test verified',
      'Panel doors closed, latched & LOTO provision intact',
    ],
  },
  {
    name: 'Ladders',
    items: [
      'Side rails and rungs free from bends, cracks, or oil',
      'Non-slip rubber safety shoes intact at base',
      '1m extension above landing level (for straight ladders)',
      '4:1 angle ratio maintained & tied off at top',
      'Color-coded quarterly inspection tag attached',
    ],
  },
  {
    name: 'Scaffolding',
    items: [
      'Base plates and sole boards resting on firm level ground',
      'Top rail (1.0m), mid-rail (0.5m), and 150mm toe-board installed',
      'Working planks fully decked, secured & free from gaps',
      'Cross-bracing and ties to permanent structure intact',
      'Valid Green Scaffold Tag signed by competent inspector',
    ],
  },
  {
    name: 'Safety Harness',
    items: [
      'Webbing straps free from cuts, fraying, burns, or paint',
      'D-rings, buckles, and rivets free from distortion or rust',
      'Double lanyard & shock absorber pack intact (not deployed)',
      'Snap hooks auto-locking cleanly',
      'Valid inspection tag & worker trained on anchor tie-off',
    ],
  },
  {
    name: 'Cranes',
    items: [
      'Valid Third-Party Load Test (TPI) certificate displayed',
      'Upper/lower hoist limit switches & overload alarm working',
      'Wire rope free from broken strands, kinks, or bird-caging',
      'Hook safety latch intact & SWL clearly stenciled',
      'Reverse/travel siren & amber beacon operational',
    ],
  },
  {
    name: 'Forklifts',
    items: [
      'Service brakes, parking brake, and steering responsive',
      'Forks free from cracks, uneven bend, or heel wear',
      'Overhead guard, seatbelt, and amber beacon functional',
      'Reverse alarm & horn operational; tires in good condition',
      'Operator carries valid authorization card',
    ],
  },
  {
    name: 'Lifting Tools and Tackles',
    items: [
      'D-shackles, slings, and chain blocks have visible SWL & ID',
      'Color code matches current quarter inspection standard',
      'Webbing slings free from tears, chemical burns, or knots',
      'Eye splices and ferrules intact without slippage',
      'Valid TPI certificate available on site',
    ],
  },
  {
    name: 'Vehicles',
    items: [
      'Headlights, tail lights, indicators, and reverse alarm working',
      'Spark arrestor fitted (for hazardous plant zones)',
      'First aid kit, fire extinguisher & wheel chocks available',
      'Driver license, PUC, insurance & fitness valid',
      'Tires tread depth adequate and lug nuts tight',
    ],
  },
  {
    name: 'Excavation',
    items: [
      'Underground utility clearance / Permit to Work signed',
      'Hard barricading erected at least 1m from trench edge',
      'Spoil soil stacked >= 1.5m away from edge',
      'Benching, sloping, or shoring provided (depth > 1.5m)',
      'Safe access/egress ladder placed every 15m',
    ],
  },
  {
    name: 'Welding Machines',
    items: [
      'Power cable & welding lead free from bare joints/cuts',
      'Dedicated earthing cable clamped directly to job piece',
      'Electrode holder fully insulated; ELCB connected',
      'VRD (Voltage Reduction Device) operational',
      'Fire extinguisher & fire blanket staged within 3m',
    ],
  },
  {
    name: 'Gas Cylinders',
    items: [
      'Stored upright, chained securely in trolley/rack',
      'Oxygen and fuel cylinders separated by >= 6m or fire wall',
      'Flashback arrestors installed at BOTH regulator & torch ends',
      'Hoses color-coded (Blue/Black O2, Red Acetylene) with crimps',
      'Valve protection caps fitted on unused cylinders',
    ],
  },
  {
    name: 'Power Tools',
    items: [
      'Protective wheel/blade guard intact and properly aligned',
      'Dead-man trigger switch working (no lock-on bypass)',
      '3-pin industrial plug & double-insulated cable intact',
      'Connected through 30mA ELCB/RCCB distribution board',
      'RPM rating of disc exceeds tool rated RPM',
    ],
  },
  {
    name: 'Emergency Equipment',
    items: [
      'Emergency eyewash & safety shower unobstructed & flowing',
      'First aid box stocked and expiry dates checked',
      'Spill containment kit complete and accessible',
      'Emergency assembly point signage & PA siren tested',
      'SCBA / stretchers inspected and sealed',
    ],
  },
  {
    name: 'Industrial Buildings',
    items: [
      'Emergency exit doors unlocked & push-bars functional',
      'Illuminated exit signs & emergency lighting operational',
      'Staircase handrails, toe-guards, and grating secure',
      'Floor load limits & structural columns free from damage',
      'Ventilation and illumination lux levels adequate',
    ],
  },
  {
    name: 'Housekeeping',
    items: [
      'Walkways & fire exits completely free from obstructions',
      'Materials stacked neatly within height & stability limits',
      'No oil/water spills or tripping cables across walkways',
      'Segregated scrap, hazardous waste & general bins labeled',
      'Protruding nails/sharp edges bent or capped',
    ],
  },
  {
    name: 'Traffic Management',
    items: [
      'Pedestrian walkways separated by physical barriers/paint',
      'Speed limit (10/20 km/h) signage & convex mirrors intact',
      'Trained banksman/flagman deployed for heavy vehicle reversing',
      'Loading/unloading bays equipped with wheel chocks',
      'High-visibility jackets worn by all yard personnel',
    ],
  },
];

export const DOCUMENT_MODULES = [
  'JSA / JHA',
  'Risk Assessment',
  'Method Statement',
  'Toolbox Talk (TBT)',
  'Permit to Work Checklist',
  'Safety Inspection Report',
  'Incident Report',
  'Near Miss Report',
  'Safety Audit Report',
  'Emergency Response Plan',
  'Training Material',
  'Daily Safety Report',
  'Weekly Safety Report',
  'Monthly HSE Report',
  'Lifting Plan Checklist',
  'Work at Height Checklist',
  'Electrical Safety Checklist',
  'Fire Safety Checklist',
  'Confined Space Checklist',
  'Hot Work Checklist',
];

export const PLANT_ASSETS = {
  hero: '/src/assets/images/hero_safety_engineer_1795470578832.jpg',
  steelPlant: '/src/assets/images/steel_plant_operations_1795470578922.jpg',
  construction: '/src/assets/images/construction_work_height_1795470579505.jpg',
  warehouse: '/src/assets/images/warehouse_logistics_safety_1795470580246.jpg',
  electrical: '/src/assets/images/power_electrical_safety_1795470580783.jpg',
  infrastructure: '/src/assets/images/infrastructure_city_plant_1795470580870.jpg',
};
