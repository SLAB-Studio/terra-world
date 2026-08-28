const milestones = [
  "Create a city from a repeatable seed.",
  "Place infrastructure and run deterministic turns.",
  "Save locally and replay the same city history.",
];

export default function HomePage() {
  return (
    <main>
      <p className="eyebrow">Terra World · developer preview</p>
      <h1>Build a city that learns to thrive.</h1>
      <p className="intro">
        Terra World is a living-city game where children experiment with water,
        energy, nature, and community systems.
      </p>
      <section aria-labelledby="foundation-heading">
        <h2 id="foundation-heading">Foundation status</h2>
        <ul>
          {milestones.map((milestone) => (
            <li key={milestone}>{milestone}</li>
          ))}
        </ul>
      </section>
      <p className="note">The playable city map is coming next.</p>
    </main>
  );
}
