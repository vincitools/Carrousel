import { redirect } from "react-router";
import styles from "./styles.module.css";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return null;
};

export default function App() {
  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Vinci Shoppable Videos</h1>
        <p className={styles.text}>
          Install and launch the app from Shopify Admin to get started.
        </p>
        <ul className={styles.list}>
          <li>
            <strong>Upload media</strong>. Add videos or images to your content library.
          </li>
          <li>
            <strong>Create playlists</strong>. Organize shoppable media into curated experiences.
          </li>
          <li>
            <strong>Publish in theme</strong>. Add the app block in Theme Editor and go live.
          </li>
        </ul>
      </div>
    </div>
  );
}
