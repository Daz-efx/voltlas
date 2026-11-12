import GridTopBar from '../components/GridTopBar';

export default function GridSectionLayout({ children }) {
  return (
    <>
      <GridTopBar />
      {children}
    </>
  );
}
