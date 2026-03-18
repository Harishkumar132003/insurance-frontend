import './Spinner.scss';

export default function Spinner({ size = 32 }) {
  return (
    <div className="spinner" style={{ width: size, height: size }} />
  );
}
