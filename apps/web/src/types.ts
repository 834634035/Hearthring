export type EntityRow = Record<string, string | number | boolean | null | undefined>;

export interface PopulationSlice {
  label: string;
  value: number;
  percent: number;
}

export interface TribePopulation {
  name: string;
  region: string;
  population: number;
  strengthLevel: number;
  percent: number;
}

export interface ContinentPopulation {
  continent: string;
  population: number;
  percent: number;
}

export interface TimelineEvent {
  title: string;
  act: string;
  region: string;
  eventType: string;
  description: string;
}

export interface DashboardData {
  counts: Record<string, number>;
  strongTribes: EntityRow[];
  totalPopulation: number;
  settlementPopulation: number;
  continentPopulation: ContinentPopulation[];
  tribePopulations: TribePopulation[];
  ageDistribution: PopulationSlice[];
  timeline: TimelineEvent[];
}

export type { FieldConfig, FieldType } from "@tribal-epic/shared";
