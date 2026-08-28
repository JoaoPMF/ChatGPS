declare module 'iso-3166-2' {
  const iso31662: {
    data: Record<string, {
      name: string;
      sub?: Record<string, { name: string; type?: string }>;
    }>;
  };
  export default iso31662;
}
