import { useCountUp } from "@/hooks/use-count-up";

interface CountUpProps {
  end: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

const CountUp = ({ end, duration, prefix = "", suffix = "", className }: CountUpProps) => {
  const { ref, display } = useCountUp({ end, duration, prefix, suffix });
  return <span ref={ref} className={className}>{display}</span>;
};

export default CountUp;
