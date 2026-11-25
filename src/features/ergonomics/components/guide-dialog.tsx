import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@ui-sdk/react/dialog";

export function GuideDialog() {
  return (
    <Dialog>
      <DialogTrigger>Guía ergonómica</DialogTrigger>
      <DialogBackdrop />
      <DialogContent initialFocus="content">
        <div>
          <DialogTitle>Guía técnica de ergonomía y privacidad</DialogTitle>
          <DialogDescription>
            Criterios preventivos para puestos con pantallas de visualización de datos y pausas
            activas.
          </DialogDescription>
        </div>

        <div className="dialog-sections">
          <section className="dialog-section">
            <h3 className="dialog-section-heading">Marco preventivo</h3>
            <p>
              Esta herramienta apoya la prevención de trastornos musculoesqueléticos en modalidad
              presencial y teletrabajo conforme a la Ley 21.220 sobre trabajo a distancia y al
              Decreto Supremo 594 sobre condiciones sanitarias y ambientales básicas en los lugares
              de trabajo.
            </p>
          </section>

          <section className="dialog-section">
            <h3 className="dialog-section-heading">Parámetros evaluados</h3>
            <ul className="dialog-list">
              <li>
                Inclinación cervical: mide la alineación de cabeza y cuello respecto de la vertical
                para prevenir sobrecarga cervical.
              </li>
              <li>
                Nivelación de hombros: detecta asimetrías en la cintura escapular frente a la
                estación de trabajo.
              </li>
              <li>
                Inclinación de tronco: evalúa la postura del torso en relación con la cadera durante
                la jornada.
              </li>
              <li>
                Pausas activas guiadas: registra repeticiones de sentadillas asistidas, elevación de
                brazos e inclinación lateral de cuello.
              </li>
            </ul>
          </section>

          <section className="dialog-section">
            <h3 className="dialog-section-heading">Modelo MoveNet y privacidad local</h3>
            <p>
              La detección de 17 puntos anatómicos se ejecuta íntegramente en su navegador mediante
              TensorFlow.js con aceleración WebGL. Ninguna imagen ni flujo de video abandona su
              dispositivo ni se transmite a servidores externos.
            </p>
            <p>
              Puede alternar entre MoveNet Lightning, optimizado para menor latencia en tiempo real,
              y MoveNet Thunder, orientado a mayor precisión anatómica en análisis detallados o
              fotografías.
            </p>
          </section>

          <section className="dialog-section">
            <h3 className="dialog-section-heading">Alcance preventivo</h3>
            <p>
              Los ángulos e índices mostrados corresponden a una estimación bidimensional de apoyo
              educativo y ergonómico. No constituyen un diagnóstico clínico ni reemplazan la
              evaluación presencial de un especialista en prevención de riesgos o medicina del
              trabajo.
            </p>
          </section>
        </div>

        <div className="dialog-footer">
          <DialogClose data-variant="solid">Cerrar guía</DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
