import type { BuildingCategory } from "@terra/campaign-schema";

export const BUILDING_NAMES: Readonly<Record<string, string>> = {
  home: "Home",
  road: "Road",
  "water-pump": "Water pump",
  "water-treatment-plant": "Water treatment",
  "solar-array": "Solar array",
  battery: "Battery",
  school: "School",
  clinic: "Clinic",
  "bus-stop": "Bus stop",
  "recycling-centre": "Recycling centre",
  wetland: "Wetland",
  "community-park": "Community park",
};

export const CATEGORY_NAMES: Readonly<Record<BuildingCategory, string>> = {
  housing: "Homes",
  water: "Water",
  energy: "Energy",
  service: "Community",
  transport: "Transport",
  waste: "Waste",
  nature: "Nature",
};

export function buildingName(id: string): string {
  return BUILDING_NAMES[id] ?? id.replaceAll("-", " ");
}
