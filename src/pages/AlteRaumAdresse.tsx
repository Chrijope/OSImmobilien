import { Navigate, useParams } from "react-router-dom";

/**
 * Aus der Erprobung liegen noch Adressen der Form /videoraum/<id> in
 * Verlaeufen und Lesezeichen. Sie sollen nicht ins Leere laufen, sondern auf
 * die neue Adresse fuehren.
 */
export default function AlteRaumAdresse() {
  const { id } = useParams();
  return <Navigate to={id ? `/videocall/raum/${id}` : "/videocall"} replace />;
}
