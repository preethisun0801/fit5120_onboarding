// sensory-app/src/pages/About.tsx
import { MapPin, Volume2 } from "lucide-react";
import Card from "../components/ui/Card";
import teamPhoto from "../assets/team-photo.jpeg";

const TEAM = [
  { name: "Parvathi Selva Ganeshan", role: "Security Analyst" },
  { name: "Merline Biju", role: "Role / focus area" },
  { name: "Preethi Sundarrajan", role: "Data Analyst/Web Developer" },
  { name: "Tao Pan", role: "Role / focus area" },
  { name: "Jiayu Bu", role: "Role / focus area" },
];

const DATA_SOURCES = [
  {
    name: "Pedestrian Counting System — past-hour counts per minute",
    use: "Live crowd levels shown on routes and the home page map.",
  },
  {
    name: "Pedestrian Counting System — monthly counts per hour (historical)",
    use: "The \"usual for this hour and weekday\" baseline that live counts are compared against.",
  },
  {
    name: "Pedestrian Counting System — sensor locations",
    use: "Where each crowd sensor physically sits, used to match sensors to routes.",
  },
  {
    name: "Microclimate Sensors",
    use: "Live and historical noise readings (decibels), scored the same way as crowd data.",
  },
  {
    name: "Landmarks and Places of Interest",
    use: "The basis for curated quiet spaces — libraries, gardens, and other low-stimulation places.",
  },
];

export default function About() {
  return (
    <div className="max-w-3xl mx-auto px-6 pt-6 md:pt-24 pb-24 md:pb-12">
      <h1 className="text-2xl font-semibold mb-2">About this project</h1>
      <p className="text-[var(--color-muted)] mb-8">
        A navigation tool for people who find crowded, loud, or unpredictable
        environments overwhelming — built for FIT5120 at Monash University.
      </p>

      <section className="mb-8">
        <h2 className="text-lg font-medium mb-3">What "sensory-aware" means right now</h2>
        <Card>
          <p className="text-sm leading-relaxed mb-4">
            Sensory sensitivity covers far more than crowds and noise — light,
            smell, texture, and unpredictability all matter too. Right now,
            this app only measures two of those:
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex items-start gap-2 flex-1">
              <MapPin className="w-4 h-4 mt-0.5 text-[var(--color-muted)] shrink-0" />
              <div>
                <p className="text-sm font-medium">Crowd levels</p>
                <p className="text-xs text-[var(--color-muted)]">
                  From pedestrian sensor counts, compared to each sensor's own
                  history for that hour and weekday.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2 flex-1">
              <Volume2 className="w-4 h-4 mt-0.5 text-[var(--color-muted)] shrink-0" />
              <div>
                <p className="text-sm font-medium">Noise levels</p>
                <p className="text-xs text-[var(--color-muted)]">
                  From microclimate sensor decibel readings, scored the same
                  relative way.
                </p>
              </div>
            </div>
          </div>
          <p className="text-xs text-[var(--color-muted)] mt-4 pt-4 border-t border-[var(--color-border)] leading-relaxed">
            Routes and quiet-space suggestions are ranked only on these two
            factors. A route with no measured crowd or noise problem could
            still be visually overwhelming, brightly lit, or unpredictable in
            ways this app doesn't yet account for.
          </p>
        </Card>
      </section>

      {/* -------------------------------------------------- Data sources */}
      <section className="mb-8">
        <h2 className="text-lg font-medium mb-3">Data sources</h2>
        <Card>
          <p className="text-sm text-[var(--color-muted)] mb-4">
            All data comes from the City of Melbourne's open data platform
            (CC BY 4.0), scoped to central Melbourne where these sensors are
            deployed.
          </p>
          <ul className="divide-y divide-[var(--color-border)]">
            {DATA_SOURCES.map((d) => (
              <li key={d.name} className="py-3">
                <p className="text-sm font-medium">{d.name}</p>
                <p className="text-xs text-[var(--color-muted)] mt-0.5">{d.use}</p>
              </li>
            ))}
          </ul>
          <a
            href="https://data.melbourne.vic.gov.au"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-[var(--color-accent)] mt-4">
          
            data.melbourne.vic.gov.au
          </a>
        </Card>
      </section>

      {/* -------------------------------------------------- Team */}
      <section className="mb-8">
        <h2 className="text-lg font-medium mb-3">Team</h2>

        <TeamPhoto />

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
          {TEAM.map((member) => (
            <Card key={member.name} className="text-center p-4">
              <div className="w-14 h-14 rounded-full bg-[var(--color-muted-bg)] mx-auto mb-3 flex items-center justify-center text-[var(--color-muted)] text-lg font-medium">
                {member.name
                  .split(" ")
                  .map((w) => w[0])
                  .join("")}
              </div>
              <p className="text-sm font-medium">{member.name}</p>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">{member.role}</p>
            </Card>
          ))}
        </div>
      </section>

      <a
        href="https://github.com/preethisun0801/fit5120_onboarding"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-xs text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
      >
         View source on GitHub
      </a>
    </div>
  );
}

function TeamPhoto() {
  return (
    <div className="w-full aspect-video rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-muted-bg)] flex items-center justify-center">
      <img src={teamPhoto} alt="The team" className="w-full h-full object-cover rounded-lg" />
    </div>
  );
}